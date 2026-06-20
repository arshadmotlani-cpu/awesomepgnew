'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { vacatingPenalty } from '@/src/services/billing';
import type { CustomChargeKind } from '@/src/services/customCharges';
import { settleDepositRefund } from '@/src/services/depositSettlement';
import { getCustomerDepositCredit } from '@/src/services/depositCredit';
import {
  executeExpressWalkInSale,
  type ExpressWalkInPaymentMethod,
  type ExpressWalkInStayType,
} from '@/src/services/expressWalkInSale';
import {
  getDepositSummaryForBooking,
  recordAdvanceDeposit,
  recordDepositCollected,
} from '@/src/services/deposits';
import { createResidentCharge } from '@/src/services/residentCharges';
import { ensureMonthlyRentInvoice } from '@/src/services/rentInvoices';
import {
  resolveBookingIdForCustomer,
} from '@/src/services/residentAdmin';

export type QuickActionResult =
  | {
      ok: true;
      message: string;
      href?: string;
      bookingId?: string;
      customerId?: string;
      paymentLinkUrl?: string;
    }
  | { ok: false; error: string };

export type ResidentQuickContext = {
  customerId: string;
  bookingId: string | null;
  tenancyStatus: string;
  monthlyRentPaise: number;
  roomId: string | null;
  pgId: string | null;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  depositCollectedPaise: number;
  depositRefundablePaise: number;
  depositDeductedPaise: number;
  vacatingPenaltyEstimatePaise: number;
};

const EXPRESS_SALE_TYPES = {
  rent_adjustment: {
    chargeType: 'rent_charge' as const,
    defaultTitle: 'Rent adjustment',
    customKind: undefined,
  },
  penalty: {
    chargeType: 'custom_charge' as const,
    customKind: 'penalty' as CustomChargeKind,
    defaultTitle: 'Penalty charge',
  },
  extra_service: {
    chargeType: 'custom_charge' as const,
    customKind: 'maintenance' as CustomChargeKind,
    defaultTitle: 'Extra service',
  },
  misc: {
    chargeType: 'custom_charge' as const,
    customKind: 'custom' as CustomChargeKind,
    defaultTitle: 'Misc charge',
  },
};

async function resolveQuickActionBookingId(
  customerId: string,
  bookingId?: string | null,
): Promise<string | null> {
  if (bookingId) return bookingId;
  return resolveBookingIdForCustomer(customerId);
}

export async function getResidentQuickContextAction(
  customerId: string,
): Promise<ResidentQuickContext | { error: string }> {
  try {
    const session = await requireAdminPermission('deposits:write');
    const { getResidentDetail } = await import('@/src/services/residentAdmin');
    const detail = await getResidentDetail(session, customerId);
    if (!detail) return { error: 'Resident not found.' };

    const bookingId =
      detail.activeTenancy?.bookingId ?? (await resolveBookingIdForCustomer(customerId));

    let depositCollectedPaise = 0;
    let depositRefundablePaise = 0;
    let depositDeductedPaise = 0;
    if (bookingId) {
      const summary = await getDepositSummaryForBooking(bookingId);
      if (summary) {
        depositCollectedPaise = summary.collectedPaise;
        depositRefundablePaise = summary.refundableBalancePaise;
        depositDeductedPaise = summary.deductedPaise;
      }
    }

    const monthlyRentPaise = detail.activeTenancy?.monthlyRentPaise ?? 0;
    const tenancyStatus = detail.activeTenancy
      ? 'active'
      : detail.customer.residencyStatus === 'vacated'
        ? 'vacated'
        : 'unassigned';

    const { db } = await import('@/src/db/client');
    const { beds } = await import('@/src/db/schema');
    const { eq } = await import('drizzle-orm');

    let roomId: string | null = null;
    if (detail.activeTenancy?.bedId) {
      const [bed] = await db
        .select({ roomId: beds.roomId })
        .from(beds)
        .where(eq(beds.id, detail.activeTenancy.bedId))
        .limit(1);
      roomId = bed?.roomId ?? null;
    }

    return {
      customerId,
      bookingId,
      tenancyStatus,
      monthlyRentPaise,
      roomId,
      pgId: detail.activeTenancy?.pgId ?? null,
      pgName: detail.activeTenancy?.pgName ?? null,
      roomNumber: detail.activeTenancy?.roomNumber ?? null,
      bedCode: detail.activeTenancy?.bedCode ?? null,
      depositCollectedPaise,
      depositRefundablePaise,
      depositDeductedPaise,
      vacatingPenaltyEstimatePaise: monthlyRentPaise > 0 ? vacatingPenalty(monthlyRentPaise) : 0,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not load resident.' };
  }
}

export async function quickAdvanceDepositAction(input: {
  customerId: string;
  bookingId?: string | null;
  amountInr: number;
  note?: string;
}): Promise<QuickActionResult> {
  try {
    const session = await requireAdminPermission('deposits:write');
    const bookingId = await resolveQuickActionBookingId(input.customerId, input.bookingId);
    if (!bookingId) {
      return { ok: false, error: 'No booking found — assign a bed or create a booking first.' };
    }
    const amountPaise = Math.round(input.amountInr * 100);
    if (amountPaise <= 0) return { ok: false, error: 'Amount must be greater than zero.' };

    await recordAdvanceDeposit({
      bookingId,
      customerId: input.customerId,
      amountPaise,
      createdByAdminId: session.adminId,
      note: input.note,
    });

    revalidateFinancialViews();
    return { ok: true, message: `Advance deposit ₹${input.amountInr.toLocaleString('en-IN')} recorded.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not record deposit.' };
  }
}

export async function quickOfflineDepositAction(input: {
  customerId: string;
  bookingId?: string | null;
  amountInr: number;
  reason: string;
  paymentMethod?: string;
}): Promise<QuickActionResult> {
  try {
    const session = await requireAdminPermission('deposits:write');
    const bookingId = await resolveQuickActionBookingId(input.customerId, input.bookingId);
    if (!bookingId) {
      return { ok: false, error: 'No booking found — assign a bed or create a booking first.' };
    }
    await assertAdminBookingAccess(session, bookingId);
    const amountPaise = Math.round(input.amountInr * 100);
    if (amountPaise <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    if (!input.reason.trim()) return { ok: false, error: 'Reason is required.' };

    await recordDepositCollected({
      bookingId,
      customerId: input.customerId,
      amountPaise,
      reason: `admin ${input.paymentMethod?.trim() || 'cash'}: ${input.reason.trim()}`,
      createdByAdminId: session.adminId,
    });
    const { syncDepositCollectionFromLedger } = await import('@/src/services/depositCollection');
    await syncDepositCollectionFromLedger(bookingId);
    revalidateFinancialViews();
    return { ok: true, message: 'Offline deposit recorded in ledger.' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not record deposit.' };
  }
}

export async function quickCreateRentInvoiceAction(input: {
  customerId: string;
  bookingId?: string | null;
  billingMonth: string;
  amountInr: number;
}): Promise<QuickActionResult> {
  try {
    await requireAdminPermission('rent:write');
    const bookingId = await resolveQuickActionBookingId(input.customerId, input.bookingId);
    if (!bookingId) {
      return { ok: false, error: 'No booking found — assign a bed before creating rent invoices.' };
    }
    const amountPaise = Math.round(input.amountInr * 100);
    if (amountPaise <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(input.billingMonth)) {
      return { ok: false, error: 'Invalid billing month.' };
    }
    const month = input.billingMonth.length === 7 ? `${input.billingMonth}-01` : input.billingMonth;

    const result = await ensureMonthlyRentInvoice({
      bookingId,
      billingMonth: month,
      amountPaise,
    });
    if (!result.ok) return { ok: false, error: result.error };

    const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
    await syncRentInvoiceToUnified(result.invoiceId);
    revalidateFinancialViews();
    return {
      ok: true,
      message: result.created
        ? `Rent invoice ${result.invoiceNumber} created for ₹${input.amountInr.toLocaleString('en-IN')}.`
        : `Rent invoice ${result.invoiceNumber} updated.`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create rent invoice.' };
  }
}

export async function quickExpressSaleAction(input: {
  customerId: string;
  bookingId?: string | null;
  saleType: keyof typeof EXPRESS_SALE_TYPES;
  amountInr: number;
  note?: string;
}): Promise<QuickActionResult> {
  try {
    const session = await requireAdminPermission('payments:write');
    const bookingId = await resolveQuickActionBookingId(input.customerId, input.bookingId);
    const amountPaise = Math.round(input.amountInr * 100);
    if (amountPaise <= 0) return { ok: false, error: 'Amount must be greater than zero.' };

    const spec = EXPRESS_SALE_TYPES[input.saleType];
    const note = input.note?.trim();
    const title = note || spec.defaultTitle;

    const result = await createResidentCharge({
      customerId: input.customerId,
      bookingId: bookingId ?? undefined,
      chargeType: spec.chargeType,
      title,
      description: note,
      amountPaise,
      customKind: spec.chargeType === 'custom_charge' ? spec.customKind : undefined,
      actorId: session.adminId,
    });
    if (!result.ok) return { ok: false, error: result.error };

    revalidateFinancialViews();
    const ref = result.invoiceNumber ?? result.rentInvoiceId?.slice(0, 8);
    return {
      ok: true,
      message: ref
        ? `Express sale created (${ref}) — invoice linked to resident.`
        : 'Express sale created — payment link ready.',
      href: result.paymentLinkUrl,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Express sale failed.' };
  }
}

export async function quickRefundSettlementAction(input: {
  customerId: string;
  bookingId?: string | null;
  amountInr: number;
  reason: string;
  refundMethod?: string;
}): Promise<QuickActionResult> {
  try {
    const session = await requireAdminPermission('deposits:write');
    const bookingId = await resolveQuickActionBookingId(input.customerId, input.bookingId);
    if (!bookingId) {
      return { ok: false, error: 'No booking found — cannot process refund without a booking.' };
    }
    await assertAdminBookingAccess(session, bookingId);
    const amountPaise = Math.round(input.amountInr * 100);
    if (amountPaise <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    if (!input.reason.trim()) return { ok: false, error: 'Reason is required.' };

    const summary = await getDepositSummaryForBooking(bookingId);
    if (!summary || amountPaise > summary.refundableBalancePaise) {
      return { ok: false, error: 'Refund exceeds refundable deposit balance.' };
    }

    const settlement = await settleDepositRefund({
      bookingId,
      customerId: input.customerId,
      idempotencyKey: `quick:${bookingId}:${randomUUID()}`,
      source: 'manual',
      adminId: session.adminId,
      reason: input.reason.trim(),
      refundPaise: amountPaise,
      refundAudit: {
        refundMethod: input.refundMethod?.trim() || null,
        refundReference: null,
        refundProofUrl: null,
      },
    });
    if (!settlement.ok) return { ok: false, error: settlement.error };

    revalidateFinancialViews();
    revalidatePath(`/admin/deposits/${bookingId}`);
    return { ok: true, message: `Refund ₹${input.amountInr.toLocaleString('en-IN')} recorded.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Refund failed.' };
  }
}

export type ExpressWalkInBedOption = {
  bedId: string;
  label: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  monthlyRatePaise: number;
  depositPaise: number;
};

export type ExpressWalkInLookupResult =
  | {
      found: true;
      customerId: string;
      fullName: string;
      email: string;
      phone: string;
      gender: 'male' | 'female' | 'other';
      kycStatus: string;
      tenancyStatus: 'active' | 'unassigned' | 'vacated';
      walletCreditPaise: number;
    }
  | { found: false };

function isPlaceholderWalkInEmail(email: string): boolean {
  return email.startsWith('walkin+') && email.endsWith('@residents.awesomepg.in');
}

export async function lookupExpressWalkInCustomerAction(
  query: string,
): Promise<ExpressWalkInLookupResult | { error: string }> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      return { error: 'Enter at least 3 characters.' };
    }

    const { findCustomerByPhone } = await import('@/src/lib/auth/customer');
    let customer = await findCustomerByPhone(trimmed);

    if (!customer) {
      const { searchResidentsForAdmin } = await import('@/src/services/adminResidentSearch');
      const results = await searchResidentsForAdmin(session, trimmed, 5);
      if (results.length === 1) {
        const { db } = await import('@/src/db/client');
        const { customers } = await import('@/src/db/schema');
        const { eq } = await import('drizzle-orm');
        customer =
          (
            await db.select().from(customers).where(eq(customers.id, results[0]!.id)).limit(1)
          )[0] ?? null;
      }
    }

    if (!customer || customer.archivedAt) {
      return { found: false };
    }

    const { getResidentDetail } = await import('@/src/services/residentAdmin');
    const detail = await getResidentDetail(session, customer.id);
    const wallet = await getCustomerDepositCredit(customer.id);

    return {
      found: true,
      customerId: customer.id,
      fullName: customer.fullName,
      email: isPlaceholderWalkInEmail(customer.email) ? '' : customer.email,
      phone: customer.phone,
      gender: customer.gender,
      kycStatus: customer.kycStatus,
      tenancyStatus: detail?.activeTenancy
        ? 'active'
        : customer.residencyStatus === 'vacated'
          ? 'vacated'
          : 'unassigned',
      walletCreditPaise: wallet.availableCreditPaise,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lookup failed.' };
  }
}

export async function listExpressWalkInBedsAction(
  checkInDate: string,
): Promise<{ ok: true; beds: ExpressWalkInBedOption[] } | { ok: false; error: string }> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const { listAssignableBeds } = await import('@/src/services/tenantAssignment');
    const rows = await listAssignableBeds(session, checkInDate);
    return {
      ok: true,
      beds: rows.map((r) => ({
        bedId: r.bedId,
        pgId: r.pgId,
        pgName: r.pgName,
        roomNumber: r.roomNumber,
        bedCode: r.bedCode,
        label: `${r.pgName} · Room ${r.roomNumber} · ${r.bedCode}`,
        monthlyRatePaise: r.monthlyRatePaise,
        depositPaise: r.depositPaise,
      })),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not load beds.' };
  }
}

export async function expressWalkInSaleAction(input: {
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
  rentAmountInr: number;
  depositRequiredInr: number;
  depositPaidInr: number;
  rentPaidInr?: number;
  walletCreditInr?: number;
  paymentMethod: ExpressWalkInPaymentMethod;
  notes?: string;
}): Promise<QuickActionResult> {
  try {
    const session = await requireAdminPermission('bookings:write');
    await requireAdminPermission('payments:write');

    if (input.stayType === 'fixed' && !input.checkOutDate?.trim()) {
      return { ok: false, error: 'Check-out date is required for fixed stays.' };
    }

    const toPaise = (inr: number) => Math.round(inr * 100);

    const result = await executeExpressWalkInSale(session, {
      customerId: input.customerId,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim(),
      gender: input.gender,
      adminVerifiedKyc: input.adminVerifiedKyc,
      bedId: input.bedId,
      checkInDate: input.checkInDate,
      stayType: input.stayType,
      checkOutDate: input.checkOutDate ?? null,
      blocksWholeRoom: input.blocksWholeRoom,
      rentAmountPaise: toPaise(input.rentAmountInr),
      depositRequiredPaise: toPaise(input.depositRequiredInr),
      depositPaidPaise: toPaise(input.depositPaidInr),
      rentPaidPaise: toPaise(input.rentPaidInr ?? 0),
      walletCreditPaise: toPaise(input.walletCreditInr ?? 0),
      paymentMethod: input.paymentMethod,
      notes: input.notes,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath('/admin/residents');
    revalidatePath('/admin/bookings');
    revalidatePath('/admin/deposits');
    revalidateFinancialViews();

    return {
      ok: true,
      message: result.message,
      customerId: result.customerId,
      bookingId: result.bookingId,
      href: `/admin/residents/${result.customerId}?walkIn=1&booking=${result.bookingCode}`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Booking failed.' };
  }
}

export async function requestRemainingDepositAction(input: {
  customerId: string;
  bookingId?: string;
  amountInr: number;
}): Promise<QuickActionResult> {
  try {
    const session = await requireAdminPermission('payments:write');
    const bookingId =
      input.bookingId ?? (await resolveBookingIdForCustomer(input.customerId));
    if (!bookingId) {
      return { ok: false, error: 'No booking found for deposit link.' };
    }
    const amountPaise = Math.round(input.amountInr * 100);
    if (amountPaise <= 0) {
      return { ok: false, error: 'Amount must be greater than zero.' };
    }

    const result = await createResidentCharge({
      customerId: input.customerId,
      bookingId,
      chargeType: 'additional_deposit',
      title: 'Security deposit — remaining balance',
      description: 'Pending deposit balance from express booking.',
      amountPaise,
      actorId: session.adminId,
    });
    if (!result.ok) return { ok: false, error: result.error };

    revalidateFinancialViews();
    return {
      ok: true,
      message: 'Deposit payment link created.',
      paymentLinkUrl: result.paymentLinkUrl,
      bookingId,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create deposit link.' };
  }
}
