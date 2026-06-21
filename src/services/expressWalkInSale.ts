/**
 * Express Walk-in Sale — admin orchestration for on-site resident creation.
 * Extends createBooking, deposit ledger, express collection, and wallet credit.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, customers, floors, pgs, rooms } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { diffDays, formatDate } from '@/src/lib/dates';
import {
  DEPOSIT_REFUND_RULE_COPY,
  STAY_TIMING_RULE_COPY,
} from '@/src/lib/residents/stayBillingRules';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import { mergeOrUpsertCustomerForAdminWalkIn } from '@/src/services/adminCustomerMerge';
import { createBooking } from '@/src/services/booking';
import { clearBedAdminMarks } from '@/src/services/bookingAdminOps';
import { applyDepositCreditToBooking, getCustomerDepositCredit } from '@/src/services/depositCredit';
import { syncDepositCollectionFromLedger } from '@/src/services/depositCollection';
import { recordExpressCollection } from '@/src/services/expressCollection';
import { clearBedInterest } from '@/src/services/bedNoticeInterest';
import { isBedAvailable } from '@/src/services/availability';
import { reconcileOrphanBedReservations } from '@/src/lib/occupancySync';
import { rollbackExpressWalkInSale } from '@/src/services/expressWalkInRollback';

const LONG_TERM_RESERVATION_END = '2099-01-01';

export type ExpressWalkInStayType = 'fixed' | 'continue';

export type ExpressWalkInPaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'other';

export type ExpressWalkInSaleInput = {
  customerId?: string;
  fullName: string;
  phone: string;
  email?: string;
  gender: 'male' | 'female' | 'other';
  adminVerifiedKyc?: boolean;

  bedId: string;
  checkInDate: string;
  stayType: ExpressWalkInStayType;
  checkOutDate?: string | null;
  blocksWholeRoom?: boolean;

  rentAmountPaise: number;
  depositRequiredPaise: number;
  depositPaidPaise: number;
  rentPaidPaise?: number;
  walletCreditPaise?: number;
  paymentMethod: ExpressWalkInPaymentMethod;

  notes?: string;
};

export type ExpressWalkInSaleResult =
  | {
      ok: true;
      customerId: string;
      bookingId: string;
      bookingCode: string;
      message: string;
      walletCreditAppliedPaise: number;
      depositRecordedPaise: number;
      rentRecordedPaise: number;
      rentInvoiceNumber?: string | null;
      pgName: string;
      roomNumber: string;
      bedCode: string;
      balanceDuePaise: number;
    }
  | { ok: false; error: string };

function invoiceNotes(input: ExpressWalkInSaleInput, walletApplied: number): string {
  const lines = [
    `Express walk-in · ${input.stayType === 'fixed' ? 'Fixed stay' : 'Continue living'}`,
    `Check-in ${input.checkInDate}${input.stayType === 'fixed' && input.checkOutDate ? ` · Check-out ${input.checkOutDate}` : ''}`,
  ];
  if (input.stayType === 'fixed' && input.checkOutDate) {
    const days = diffDays(input.checkInDate, input.checkOutDate);
    const dailyRatePaise =
      days > 0 && input.rentAmountPaise > 0
        ? Math.round(input.rentAmountPaise / days)
        : 0;
    lines.push(
      `${days} day${days === 1 ? '' : 's'} · ₹${(dailyRatePaise / 100).toLocaleString('en-IN')}/day · Rent ₹${(input.rentAmountPaise / 100).toLocaleString('en-IN')}`,
    );
  } else if (input.rentAmountPaise > 0) {
    lines.push(`Monthly rent ₹${(input.rentAmountPaise / 100).toLocaleString('en-IN')}`);
  }
  lines.push(
    STAY_TIMING_RULE_COPY,
    'Electricity included in rent. AC usage may be charged separately when enabled.',
    DEPOSIT_REFUND_RULE_COPY,
  );
  if (walletApplied > 0) {
    lines.push(`Wallet credit applied: ₹${(walletApplied / 100).toLocaleString('en-IN')}`);
  }
  if (input.notes?.trim()) lines.push(input.notes.trim());
  return lines.join(' · ');
}

export async function executeExpressWalkInSale(
  session: AdminSession,
  input: ExpressWalkInSaleInput,
): Promise<ExpressWalkInSaleResult> {
  const customerResult = await mergeOrUpsertCustomerForAdminWalkIn({
    customerId: input.customerId,
    fullName: input.fullName,
    phone: input.phone,
    email: input.email,
    gender: input.gender,
    adminVerifiedKyc: input.adminVerifiedKyc,
  });
  if (!customerResult.ok) {
    return { ok: false, error: customerResult.error };
  }
  const customerId = customerResult.customerId;

  const [customerRow] = await db
    .select({
      fullName: customers.fullName,
      email: customers.email,
      phone: customers.phone,
      gender: customers.gender,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!customerRow) {
    return { ok: false, error: 'Customer record missing after merge.' };
  }

  const activeTenancy = await getActiveTenancyForCustomer(customerId);
  if (activeTenancy) {
    return {
      ok: false,
      error: `Resident already occupies ${activeTenancy.pgName} · Room ${activeTenancy.roomNumber} · ${activeTenancy.bedCode}.`,
    };
  }

  const [bedCtx] = await db
    .select({
      pgId: pgs.id,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(beds.id, input.bedId))
    .limit(1);

  if (!bedCtx) {
    return { ok: false, error: 'Bed not found.' };
  }
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, bedCtx.pgId)) {
    return { ok: false, error: 'You do not have access to this PG.' };
  }

  await clearBedAdminMarks(input.bedId);
  await reconcileOrphanBedReservations(input.bedId);

  const reservationEnd =
    input.stayType === 'continue'
      ? LONG_TERM_RESERVATION_END
      : input.checkOutDate ?? input.checkInDate;

  const available = await isBedAvailable(
    {
      bedId: input.bedId,
      startDate: input.checkInDate,
      endDate: reservationEnd,
    },
    { ignoreManualOccupied: true },
  );
  if (!available) {
    return { ok: false, error: 'Selected bed is not available for these dates.' };
  }

  const walletCreditRequested = Math.max(0, input.walletCreditPaise ?? 0);
  let walletCreditApplied = 0;
  if (walletCreditRequested > 0) {
    const wallet = await getCustomerDepositCredit(customerId);
    walletCreditApplied = Math.min(walletCreditRequested, wallet.availableCreditPaise);
  }

  const durationMode = input.stayType === 'continue' ? 'open_ended' : 'fixed_stay';
  const endDate = input.stayType === 'continue' ? null : input.checkOutDate ?? null;

  const bookingResult = await createBooking({
    bedIds: [input.bedId],
    startDate: input.checkInDate,
    endDate,
    durationMode,
    reservationEndDate: reservationEnd,
    blocksRoomAvailability: input.blocksWholeRoom === true,
    customerId,
    customer: {
      fullName: customerRow.fullName,
      email: customerRow.email,
      phone: customerRow.phone,
      gender: customerRow.gender,
    },
    customMonthlyRatePaise: input.rentAmountPaise > 0 ? input.rentAmountPaise : undefined,
    customDepositPaise: input.depositRequiredPaise > 0 ? input.depositRequiredPaise : undefined,
    notes: invoiceNotes(input, walletCreditApplied),
    createdVia: 'admin',
    createdByAdminId: session.adminId,
  });

  if (!bookingResult.ok) {
    return { ok: false, error: bookingResult.message };
  }

  const { bookingId, bookingCode } = bookingResult;
  const rollbackCtx = {
    bookingId,
    bookingCode,
    customerId,
    adminId: session.adminId,
  };

  async function failAfterBooking(error: string): Promise<ExpressWalkInSaleResult> {
    await rollbackExpressWalkInSale({
      ...rollbackCtx,
      reason: `[rollback] ${error}`,
    }).catch((err) => {
      console.error('[expressWalkInSale] rollback failed after partial create', err);
    });
    return { ok: false, error };
  }

  if (walletCreditApplied > 0) {
    const credit = await applyDepositCreditToBooking({
      customerId,
      targetBookingId: bookingId,
      creditPaise: walletCreditApplied,
    });
    if (!credit.ok) {
      return failAfterBooking(credit.error);
    }
  }

  const paymentDate = formatDate(new Date());
  const collectionNotes = invoiceNotes(input, walletCreditApplied);
  let depositRecordedPaise = 0;
  let rentRecordedPaise = 0;
  let rentInvoiceNumber: string | null = null;
  let rentInvoiceId: string | null = null;

  const cashDepositPaise = Math.max(0, input.depositPaidPaise);
  if (cashDepositPaise > 0) {
    const dep = await recordExpressCollection({
      customerId,
      bookingId,
      chargeType: 'deposit',
      amountPaise: cashDepositPaise,
      paymentDate,
      paymentMethod: input.paymentMethod,
      notes: collectionNotes,
      createAsPaid: true,
      actorId: session.adminId,
    });
    if (!dep.ok) {
      return failAfterBooking(dep.error);
    }
    depositRecordedPaise = cashDepositPaise;
  }

  const rentPaid = Math.max(0, input.rentPaidPaise ?? 0);
  if (rentPaid > 0) {
    const billingMonth = input.checkInDate.slice(0, 7) + '-01';
    const rent = await recordExpressCollection({
      customerId,
      bookingId,
      chargeType: 'rent',
      amountPaise: rentPaid,
      billingMonth,
      paymentDate,
      paymentMethod: input.paymentMethod,
      notes: collectionNotes,
      createAsPaid: true,
      actorId: session.adminId,
    });
    if (!rent.ok) {
      return failAfterBooking(rent.error);
    }
    rentRecordedPaise = rentPaid;
    rentInvoiceNumber = rent.invoiceNumber ?? null;
    rentInvoiceId = rent.rentInvoiceId ?? null;
  }

  if (depositRecordedPaise > 0 || rentRecordedPaise > 0) {
    try {
      const { finalizeExpressWalkInFinancialInvoice } = await import('@/src/services/unifiedInvoices');
      await finalizeExpressWalkInFinancialInvoice({
        bookingId,
        rentInvoiceId,
        depositRecordedPaise,
        rentRecordedPaise,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Invoice sync failed after express collection.';
      return failAfterBooking(message);
    }
  }

  try {
    await syncDepositCollectionFromLedger(bookingId);

    await db
      .update(customers)
      .set({ residencyStatus: 'active', updatedAt: new Date() })
      .where(eq(customers.id, customerId));

    await clearBedInterest(input.bedId).catch(() => undefined);
    const { reconcileBookingOccupancy } = await import('@/src/lib/occupancySync');
    await reconcileBookingOccupancy(bookingId);

    const { revalidateFinancialViews } = await import('@/src/lib/billing/revalidateFinancialViews');
    revalidateFinancialViews();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Finalization failed.';
    return failAfterBooking(message);
  }

  const balanceDuePaise = Math.max(
    0,
    input.depositRequiredPaise - depositRecordedPaise - walletCreditApplied,
  );

  return {
    ok: true,
    customerId,
    bookingId,
    bookingCode,
    walletCreditAppliedPaise: walletCreditApplied,
    depositRecordedPaise,
    rentRecordedPaise,
    rentInvoiceNumber,
    pgName: bedCtx.pgName,
    roomNumber: bedCtx.roomNumber,
    bedCode: bedCtx.bedCode,
    balanceDuePaise,
    message: `Walk-in booking ${bookingCode} created. Bed locked · deposit and rent recorded from ledger.`,
  };
}
