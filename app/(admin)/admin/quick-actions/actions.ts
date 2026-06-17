'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { recordAdvanceDeposit } from '@/src/services/deposits';
import { createResidentCharge } from '@/src/services/residentCharges';
import { ensureMonthlyRentInvoice } from '@/src/services/rentInvoices';
import type { CustomChargeKind } from '@/src/services/customCharges';
import { randomUUID } from 'node:crypto';
import { settleDepositRefund } from '@/src/services/depositSettlement';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { recordDepositCollected } from '@/src/services/deposits';

export type QuickActionResult =
  | { ok: true; message: string; href?: string }
  | { ok: false; error: string };

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

export async function quickAdvanceDepositAction(input: {
  bookingId: string;
  customerId: string;
  amountInr: number;
  note?: string;
}): Promise<QuickActionResult> {
  try {
    const session = await requireAdminPermission('deposits:write');
    const amountPaise = Math.round(input.amountInr * 100);
    if (amountPaise <= 0) return { ok: false, error: 'Amount must be greater than zero.' };

    await recordAdvanceDeposit({
      bookingId: input.bookingId,
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
  bookingId: string;
  amountInr: number;
  reason: string;
  paymentMethod?: string;
}): Promise<QuickActionResult> {
  try {
    const session = await requireAdminPermission('deposits:write');
    await assertAdminBookingAccess(session, input.bookingId);
    const amountPaise = Math.round(input.amountInr * 100);
    if (amountPaise <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    if (!input.reason.trim()) return { ok: false, error: 'Reason is required.' };

    const { db } = await import('@/src/db/client');
    const { bookings } = await import('@/src/db/schema');
    const { eq } = await import('drizzle-orm');
    const [row] = await db
      .select({ customerId: bookings.customerId })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .limit(1);
    if (!row) return { ok: false, error: 'Booking not found.' };

    const method = input.paymentMethod?.trim() || 'cash';
    await recordDepositCollected({
      bookingId: input.bookingId,
      customerId: row.customerId,
      amountPaise,
      reason: `admin ${method}: ${input.reason.trim()}`,
      createdByAdminId: session.adminId,
    });
    const { syncDepositCollectionFromLedger } = await import('@/src/services/depositCollection');
    await syncDepositCollectionFromLedger(input.bookingId);
    revalidateFinancialViews();
    return { ok: true, message: 'Offline deposit recorded in ledger.' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not record deposit.' };
  }
}

export async function quickCreateRentInvoiceAction(input: {
  bookingId: string;
  billingMonth: string;
  amountInr: number;
}): Promise<QuickActionResult> {
  try {
    await requireAdminPermission('rent:write');
    const amountPaise = Math.round(input.amountInr * 100);
    if (amountPaise <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(input.billingMonth)) {
      return { ok: false, error: 'Invalid billing month.' };
    }
    const month = input.billingMonth.length === 7 ? `${input.billingMonth}-01` : input.billingMonth;

    const result = await ensureMonthlyRentInvoice({
      bookingId: input.bookingId,
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
  bookingId?: string;
  saleType: keyof typeof EXPRESS_SALE_TYPES;
  amountInr: number;
  note?: string;
}): Promise<QuickActionResult> {
  try {
    const session = await requireAdminPermission('payments:write');
    const amountPaise = Math.round(input.amountInr * 100);
    if (amountPaise <= 0) return { ok: false, error: 'Amount must be greater than zero.' };

    const spec = EXPRESS_SALE_TYPES[input.saleType];
    const note = input.note?.trim();
    const title = note || spec.defaultTitle;

    const result = await createResidentCharge({
      customerId: input.customerId,
      bookingId: input.bookingId,
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
  bookingId: string;
  amountInr: number;
  reason: string;
  refundMethod?: string;
}): Promise<QuickActionResult> {
  try {
    const session = await requireAdminPermission('deposits:write');
    await assertAdminBookingAccess(session, input.bookingId);
    const amountPaise = Math.round(input.amountInr * 100);
    if (amountPaise <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    if (!input.reason.trim()) return { ok: false, error: 'Reason is required.' };

    const { db } = await import('@/src/db/client');
    const { bookings } = await import('@/src/db/schema');
    const { eq } = await import('drizzle-orm');
    const [row] = await db
      .select({ customerId: bookings.customerId })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .limit(1);
    if (!row) return { ok: false, error: 'Booking not found.' };

    const summary = await getDepositSummaryForBooking(input.bookingId);
    if (!summary || amountPaise > summary.refundableBalancePaise) {
      return { ok: false, error: 'Refund exceeds refundable deposit balance.' };
    }

    const settlement = await settleDepositRefund({
      bookingId: input.bookingId,
      customerId: row.customerId,
      idempotencyKey: `quick:${input.bookingId}:${randomUUID()}`,
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
    revalidatePath(`/admin/deposits/${input.bookingId}`);
    return { ok: true, message: `Refund ₹${input.amountInr.toLocaleString('en-IN')} recorded.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Refund failed.' };
  }
}
