/**
 * Express Booking POS — sale orchestration with historical vs live branching.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, beds, customers, floors, pgs, rooms } from '@/src/db/schema';
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
import {
  recordExpressBookingPayment,
  type ExpressBookingPaymentStatus,
} from '@/src/services/expressBookingPayment';
import { quoteExpressBooking, isHistoricalCheckIn } from '@/src/services/expressBookingQuote';
import { clearBedInterest } from '@/src/services/bedNoticeInterest';
import { isBedAvailable } from '@/src/services/availability';
import { validateResidentGenderForBed } from '@/src/services/pgGenderPolicy';
import { reconcileOrphanBedReservations } from '@/src/lib/occupancySync';
import { rollbackExpressWalkInSale } from '@/src/services/expressWalkInRollback';
import {
  beginExpressBookingIdempotency,
  completeExpressBookingIdempotency,
  deriveExpressBookingIdempotencyKey,
  failExpressBookingIdempotency,
  type ExpressBookingIdempotencyPayload,
} from '@/src/services/expressBookingIdempotency';

export type ExpressBookingStayType = 'fixed' | 'continue';
export type ExpressWalkInStayType = ExpressBookingStayType;
export type ExpressWalkInPaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'other';

export type ExpressBookingSaleInput = {
  customerId?: string;
  fullName: string;
  phone: string;
  email?: string;
  gender: 'male' | 'female' | 'other';
  adminVerifiedKyc?: boolean;

  bedId: string;
  checkInDate: string;
  stayType: ExpressBookingStayType;
  checkOutDate?: string | null;
  blocksWholeRoom?: boolean;

  /** Server validates against quoteExpressBooking — client values are hints only. */
  rentAmountPaise: number;
  depositRequiredPaise: number;
  depositPaidPaise: number;
  rentPaidPaise?: number;
  walletCreditPaise?: number;
  paymentMethod: ExpressWalkInPaymentMethod;
  paymentStatus?: ExpressBookingPaymentStatus;
  amountReceivedPaise?: number;

  notes?: string;
  /** Stable key from client or derived server-side — prevents duplicate bookings on double submit. */
  idempotencyKey?: string;
};

export type ExpressBookingSaleResult =
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
      financialInvoiceId?: string | null;
      pgName: string;
      roomNumber: string;
      bedCode: string;
      balanceDuePaise: number;
      historical: boolean;
    }
  | { ok: false; error: string };

export type ExpressWalkInSaleInput = ExpressBookingSaleInput;
export type ExpressWalkInSaleResult = ExpressBookingSaleResult;

function invoiceNotes(input: ExpressBookingSaleInput, walletApplied: number): string {
  const lines = [
    `Express booking · ${input.stayType === 'fixed' ? 'Fixed Stay' : 'Monthly Stay'}`,
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
  );
  if (input.stayType === 'continue') {
    lines.push(DEPOSIT_REFUND_RULE_COPY);
  }
  if (walletApplied > 0) {
    lines.push(`Wallet credit applied: ₹${(walletApplied / 100).toLocaleString('en-IN')}`);
  }
  if (input.notes?.trim()) lines.push(input.notes.trim());
  return lines.join(' · ');
}

async function resolveBedContext(bedId: string) {
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
    .where(eq(beds.id, bedId))
    .limit(1);
  return bedCtx ?? null;
}

async function validateQuote(input: ExpressBookingSaleInput): Promise<
  | { ok: true; quote: Awaited<ReturnType<typeof quoteExpressBooking>> }
  | { ok: false; error: string }
> {
  try {
    const quote = await quoteExpressBooking({
      bedId: input.bedId,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      stayType: input.stayType,
    });

    if (input.stayType === 'fixed' && input.depositRequiredPaise > 0) {
      return { ok: false, error: 'Fixed stays do not include deposit.' };
    }
    if (input.stayType === 'fixed' && (input.walletCreditPaise ?? 0) > 0) {
      return { ok: false, error: 'Wallet credit applies to monthly stays only.' };
    }

    const tolerance = 100;
    if (Math.abs(quote.rentPaise - input.rentAmountPaise) > tolerance) {
      return {
        ok: false,
        error: `Rent mismatch — expected ₹${(quote.rentPaise / 100).toLocaleString('en-IN')} from catalog pricing.`,
      };
    }
    if (
      input.stayType === 'continue' &&
      Math.abs(quote.depositPaise - input.depositRequiredPaise) > tolerance
    ) {
      return {
        ok: false,
        error: `Deposit mismatch — expected ₹${(quote.depositPaise / 100).toLocaleString('en-IN')}.`,
      };
    }

    return { ok: true, quote };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not quote booking.' };
  }
}

async function executeHistoricalSale(
  session: AdminSession,
  input: ExpressBookingSaleInput,
  customerId: string,
  activeTenancy: Awaited<ReturnType<typeof getActiveTenancyForCustomer>>,
  bedCtx: NonNullable<Awaited<ReturnType<typeof resolveBedContext>>>,
): Promise<ExpressBookingSaleResult> {
  if (!activeTenancy) {
    return {
      ok: false,
      error:
        'Historical billing requires an active booking. Create a live booking first, or use today’s check-in date.',
    };
  }

  const collectionNotes = invoiceNotes(input, 0);
  const paymentStatus = input.paymentStatus ?? 'paid_in_full';
  const totalRentPaise = input.rentAmountPaise;

  if (totalRentPaise <= 0 && input.stayType === 'fixed') {
    return { ok: false, error: 'Rent amount is required.' };
  }

  let rentRecordedPaise = 0;
  let rentInvoiceNumber: string | null = null;
  let rentInvoiceId: string | null = null;
  let balanceDuePaise = 0;

  if (totalRentPaise > 0) {
    const rentPayment = await recordExpressBookingPayment({
      customerId,
      bookingId: activeTenancy.bookingId,
      billingMonth: input.checkInDate,
      totalRentPaise,
      amountReceivedPaise: input.amountReceivedPaise ?? input.rentPaidPaise ?? 0,
      paymentStatus,
      paymentMethod: input.paymentMethod,
      notes: collectionNotes,
      actorId: session.adminId,
    });
    if (!rentPayment.ok) {
      return { ok: false, error: rentPayment.error };
    }
    rentRecordedPaise = rentPayment.rentRecordedPaise;
    rentInvoiceNumber = rentPayment.rentInvoiceNumber;
    rentInvoiceId = rentPayment.rentInvoiceId;
    balanceDuePaise = rentPayment.balanceDuePaise;
  }

  if (input.stayType === 'continue' && input.depositPaidPaise > 0) {
    const dep = await recordExpressCollection({
      customerId,
      bookingId: activeTenancy.bookingId,
      chargeType: 'deposit',
      amountPaise: input.depositPaidPaise,
      paymentDate: formatDate(new Date()),
      paymentMethod: input.paymentMethod,
      notes: collectionNotes,
      createAsPaid: true,
      actorId: session.adminId,
    });
    if (!dep.ok) {
      return { ok: false, error: dep.error };
    }
  }

  let financialInvoiceId: string | null = null;
  if (rentRecordedPaise > 0 || input.depositPaidPaise > 0) {
    const { finalizeExpressWalkInFinancialInvoice } = await import('@/src/services/unifiedInvoices');
    financialInvoiceId = await finalizeExpressWalkInFinancialInvoice({
      bookingId: activeTenancy.bookingId,
      rentInvoiceId,
      depositRecordedPaise: input.depositPaidPaise,
      rentRecordedPaise,
    });
  }

  const { revalidateFinancialViews } = await import('@/src/lib/billing/revalidateFinancialViews');
  revalidateFinancialViews();

  return {
    ok: true,
    customerId,
    bookingId: activeTenancy.bookingId,
    bookingCode: activeTenancy.bookingCode,
    walletCreditAppliedPaise: 0,
    depositRecordedPaise: input.depositPaidPaise,
    rentRecordedPaise,
    rentInvoiceNumber,
    financialInvoiceId,
    pgName: bedCtx.pgName,
    roomNumber: bedCtx.roomNumber,
    bedCode: bedCtx.bedCode,
    balanceDuePaise,
    historical: true,
    message: `Historical invoice recorded for ${activeTenancy.bookingCode}.`,
  };
}

export async function executeExpressBookingSale(
  session: AdminSession,
  input: ExpressBookingSaleInput,
): Promise<ExpressBookingSaleResult> {
  const idempotencyPayload: ExpressBookingIdempotencyPayload = {
    adminId: session.adminId,
    customerId: input.customerId,
    phone: input.phone,
    bedId: input.bedId,
    checkInDate: input.checkInDate,
    stayType: input.stayType,
    checkOutDate: input.checkOutDate,
    rentAmountPaise: input.rentAmountPaise,
    depositRequiredPaise: input.depositRequiredPaise,
    paymentStatus: input.paymentStatus,
  };
  const idempotencyKey =
    input.idempotencyKey?.trim() || deriveExpressBookingIdempotencyKey(idempotencyPayload);

  const idem = await beginExpressBookingIdempotency(idempotencyKey, session.adminId);
  if (idem.kind === 'replay') {
    return idem.result;
  }
  if (idem.kind === 'in_progress') {
    return {
      ok: false,
      error:
        'This booking is already being created. Wait a few seconds before trying again.',
    };
  }

  async function abortSale(error: string): Promise<ExpressBookingSaleResult> {
    await failExpressBookingIdempotency(idempotencyKey, session.adminId, error);
    return { ok: false, error };
  }

  const quoteCheck = await validateQuote(input);
  if (!quoteCheck.ok) {
    await failExpressBookingIdempotency(idempotencyKey, session.adminId, quoteCheck.error);
    return quoteCheck;
  }

  const customerResult = await mergeOrUpsertCustomerForAdminWalkIn({
    customerId: input.customerId,
    fullName: input.fullName,
    phone: input.phone,
    email: input.email,
    gender: input.gender,
    adminVerifiedKyc: input.adminVerifiedKyc,
  });
  if (!customerResult.ok) {
    await failExpressBookingIdempotency(idempotencyKey, session.adminId, customerResult.error);
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
    return abortSale('Customer record missing after merge.');
  }

  const bedCtx = await resolveBedContext(input.bedId);
  if (!bedCtx) {
    return abortSale('Bed not found.');
  }
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, bedCtx.pgId)) {
    return abortSale('You do not have access to this PG.');
  }

  const activeTenancy = await getActiveTenancyForCustomer(customerId);
  const historical = isHistoricalCheckIn(input.checkInDate);

  if (historical) {
    const historicalResult = await executeHistoricalSale(
      session,
      input,
      customerId,
      activeTenancy,
      bedCtx,
    );
    if (historicalResult.ok) {
      await completeExpressBookingIdempotency(idempotencyKey, session.adminId, historicalResult);
    } else {
      await failExpressBookingIdempotency(idempotencyKey, session.adminId, historicalResult.error);
    }
    return historicalResult;
  }

  if (activeTenancy) {
    return abortSale(
      `Resident already occupies ${activeTenancy.pgName} · Room ${activeTenancy.roomNumber} · ${activeTenancy.bedCode}. Use historical check-in to bill the current stay.`,
    );
  }

  await clearBedAdminMarks(input.bedId);
  await reconcileOrphanBedReservations(input.bedId);

  const reservationEnd =
    input.stayType === 'continue'
      ? null
      : (input.checkOutDate ?? input.checkInDate);

  const available = await isBedAvailable(
    {
      bedId: input.bedId,
      startDate: input.checkInDate,
      endDate: reservationEnd,
    },
    { ignoreManualOccupied: true },
  );
  if (!available) {
    return abortSale('Selected bed is not available for these dates.');
  }

  const genderCheck = await validateResidentGenderForBed(input.bedId, input.gender);
  if (!genderCheck.ok) {
    return abortSale(genderCheck.error);
  }

  const walletCreditRequested =
    input.stayType === 'continue' ? Math.max(0, input.walletCreditPaise ?? 0) : 0;
  let walletCreditApplied = 0;
  if (walletCreditRequested > 0) {
    const wallet = await getCustomerDepositCredit(customerId);
    walletCreditApplied = Math.min(walletCreditRequested, wallet.availableCreditPaise);
  }

  const durationMode = input.stayType === 'continue' ? 'open_ended' : 'fixed_stay';
  const endDate = input.stayType === 'continue' ? null : (input.checkOutDate ?? null);

  const bookingResult = await createBooking({
    bedIds: [input.bedId],
    startDate: input.checkInDate,
    endDate,
    durationMode,
    blocksRoomAvailability: input.blocksWholeRoom === true,
    customerId,
    customer: {
      fullName: customerRow.fullName,
      email: customerRow.email,
      phone: customerRow.phone,
      gender: customerRow.gender,
    },
    customMonthlyRatePaise:
      input.stayType === 'continue' && input.rentAmountPaise > 0
        ? input.rentAmountPaise
        : undefined,
    customDepositPaise:
      input.stayType === 'continue' && input.depositRequiredPaise > 0
        ? input.depositRequiredPaise
        : undefined,
    notes: invoiceNotes(input, walletCreditApplied),
    createdVia: 'admin',
    createdByAdminId: session.adminId,
    depositCreditAppliedPaise: walletCreditApplied > 0 ? walletCreditApplied : undefined,
  });

  if (!bookingResult.ok) {
    return abortSale(bookingResult.message);
  }

  const { bookingId, bookingCode } = bookingResult;
  const rollbackCtx = {
    bookingId,
    bookingCode,
    customerId,
    adminId: session.adminId,
  };

  async function failAfterBooking(error: string): Promise<ExpressBookingSaleResult> {
    const rolled = await rollbackExpressWalkInSale({
      ...rollbackCtx,
      reason: `[rollback] ${error}`,
    });
    if (!rolled.ok) {
      console.error('[expressBookingSale] rollback failed after partial create', rolled.error);
      await failExpressBookingIdempotency(idempotencyKey, session.adminId, error);
      return {
        ok: false,
        error: `${error} Cleanup failed (${rolled.error}). Try again in a moment.`,
      };
    }
    await failExpressBookingIdempotency(idempotencyKey, session.adminId, error);
    return { ok: false, error };
  }

  if (walletCreditApplied > 0) {
    const walletBefore = await getCustomerDepositCredit(customerId);
    const largestSource = walletBefore.byBooking
      .filter((b) => b.availablePaise > 0)
      .sort((a, b) => b.availablePaise - a.availablePaise)[0];
    const credit = await applyDepositCreditToBooking({
      customerId,
      targetBookingId: bookingId,
      creditPaise: walletCreditApplied,
      sourceBookingId: largestSource?.bookingId,
    });
    if (!credit.ok) {
      return failAfterBooking(credit.error);
    }
    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: session.adminId,
      entity: 'booking',
      entityId: bookingId,
      action: 'express_booking_deposit_credit',
      diff: {
        creditAppliedPaise: walletCreditApplied,
        sourceBookingId: largestSource?.bookingId ?? null,
        targetBookingCode: bookingCode,
      },
    });
  }

  const collectionNotes = invoiceNotes(input, walletCreditApplied);
  let depositRecordedPaise = 0;
  let rentRecordedPaise = 0;
  let rentInvoiceNumber: string | null = null;
  let rentInvoiceId: string | null = null;
  let balanceDuePaise = 0;

  const cashDepositPaise =
    input.stayType === 'continue' ? Math.max(0, input.depositPaidPaise) : 0;
  if (cashDepositPaise > 0) {
    const dep = await recordExpressCollection({
      customerId,
      bookingId,
      chargeType: 'deposit',
      amountPaise: cashDepositPaise,
      paymentDate: formatDate(new Date()),
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

  const paymentStatus = input.paymentStatus ?? 'paid_in_full';
  const totalRentPaise = input.rentAmountPaise;

  if (totalRentPaise > 0) {
    if (paymentStatus === 'due_bill' || paymentStatus === 'partially_paid') {
      const rentPayment = await recordExpressBookingPayment({
        customerId,
        bookingId,
        billingMonth: input.checkInDate,
        totalRentPaise,
        amountReceivedPaise:
          paymentStatus === 'partially_paid'
            ? (input.amountReceivedPaise ?? input.rentPaidPaise ?? 0)
            : 0,
        paymentStatus,
        paymentMethod: input.paymentMethod,
        notes: collectionNotes,
        actorId: session.adminId,
      });
      if (!rentPayment.ok) {
        return failAfterBooking(rentPayment.error);
      }
      rentRecordedPaise = rentPayment.rentRecordedPaise;
      rentInvoiceNumber = rentPayment.rentInvoiceNumber;
      rentInvoiceId = rentPayment.rentInvoiceId;
      balanceDuePaise = rentPayment.balanceDuePaise;
    } else {
      const rentPaid = Math.max(0, input.rentPaidPaise ?? totalRentPaise);
      const rent = await recordExpressCollection({
        customerId,
        bookingId,
        chargeType: 'rent',
        amountPaise: rentPaid,
        billingMonth: input.checkInDate.slice(0, 7) + '-01',
        paymentDate: formatDate(new Date()),
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
  }

  let financialInvoiceId: string | null = null;
  if (depositRecordedPaise > 0 || rentRecordedPaise > 0) {
    try {
      const { finalizeExpressWalkInFinancialInvoice } = await import('@/src/services/unifiedInvoices');
      financialInvoiceId = await finalizeExpressWalkInFinancialInvoice({
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
  } else if (rentInvoiceId) {
    const { resolveFinancialInvoiceIdForSource } = await import('@/src/services/adminCashSettlement');
    financialInvoiceId = await resolveFinancialInvoiceIdForSource({
      sourceTable: 'rent_invoices',
      sourceId: rentInvoiceId,
    });
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

    const { ensureBillingProfileForBooking } = await import('@/src/services/residentBillingProfiles');
    await ensureBillingProfileForBooking(bookingId).catch(() => undefined);

    try {
      const { ensureContinuousResidencyOnBookingConfirmed } = await import(
        '@/src/services/continuousResidency'
      );
      await ensureContinuousResidencyOnBookingConfirmed(bookingId);
    } catch (residencyErr) {
      console.error('continuous residency on express booking failed:', residencyErr);
    }

    const { revalidateFinancialViews } = await import('@/src/lib/billing/revalidateFinancialViews');
    revalidateFinancialViews();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Finalization failed.';
    return failAfterBooking(message);
  }

  balanceDuePaise = Math.max(
    balanceDuePaise,
    input.stayType === 'continue'
      ? Math.max(0, input.depositRequiredPaise - depositRecordedPaise - walletCreditApplied)
      : 0,
  );

  const successResult = {
    ok: true as const,
    customerId,
    bookingId,
    bookingCode,
    walletCreditAppliedPaise: walletCreditApplied,
    depositRecordedPaise,
    rentRecordedPaise,
    rentInvoiceNumber,
    financialInvoiceId,
    pgName: bedCtx.pgName,
    roomNumber: bedCtx.roomNumber,
    bedCode: bedCtx.bedCode,
    balanceDuePaise,
    historical: false,
    message: `Booking ${bookingCode} created · bed locked · invoice recorded.`,
  };
  await completeExpressBookingIdempotency(idempotencyKey, session.adminId, successResult);
  return successResult;
}

/** @deprecated Use executeExpressBookingSale */
export const executeExpressWalkInSale = executeExpressBookingSale;
