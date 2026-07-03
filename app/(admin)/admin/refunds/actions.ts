'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import type { RefundActionState } from '@/app/(admin)/admin/refunds/actionState';
import {
  formatDeductionReason,
  isDeductionCategory,
  type DeductionCategory,
} from '@/src/lib/financial/deductionCategories';
import { applyDepositCreditToBooking } from '@/src/services/depositCredit';
import { applyDepositDeduction, settleDepositRefund } from '@/src/services/depositSettlement';
import { markCheckoutRefundPaid } from '@/src/services/checkoutSettlement';
import { toRefundConsoleWorkspaceDTO, type RefundConsoleWorkspaceDTO } from '@/src/lib/refund/refundConsoleDto';
import {
  getRefundConsoleWorkspace,
  listRefundConsoleBookingsForCustomer,
  searchRefundConsoleBookings,
} from '@/src/services/refundConsole';

async function resolveBooking(bookingId: string) {
  const { db } = await import('@/src/db/client');
  const { bookings } = await import('@/src/db/schema');
  const [row] = await db
    .select({ customerId: bookings.customerId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row ?? null;
}

async function resolveDepositSettlementForCheckout(checkoutSettlementId: string) {
  const { db } = await import('@/src/db/client');
  const { checkoutSettlements } = await import('@/src/db/schema');
  const [row] = await db
    .select({ depositSettlementId: checkoutSettlements.depositSettlementId })
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, checkoutSettlementId))
    .limit(1);
  return row?.depositSettlementId ?? null;
}

function parseInrPaise(form: FormData, field = 'amountInr'): number | null {
  const raw = String(form.get(field) ?? '');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function parseNote(form: FormData, field = 'note'): string | null {
  const raw = String(form.get(field) ?? '').trim();
  return raw.length > 0 ? raw : null;
}

function revalidateRefundConsole(
  bookingId: string,
  opts?: { settlementId?: string | null; customerId?: string | null },
) {
  revalidatePath('/admin/refunds');
  revalidatePath(`/admin/refunds?booking=${bookingId}`);
  revalidatePath('/admin/operations');
  revalidatePath('/admin/operations?filter=refund_due');
  revalidatePath('/admin/overview');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/analytics');
  revalidatePath('/admin/collections');
  revalidatePath('/admin/checkout-settlements');
  revalidatePath('/admin/vacating');
  revalidatePath('/admin/deposits');
  revalidatePath(`/admin/deposits/${bookingId}`);
  revalidatePath('/admin/residents');
  if (opts?.customerId) {
    revalidatePath(`/admin/residents/${opts.customerId}`);
  }
  revalidateFinancialViews();
  if (opts?.settlementId) {
    revalidatePath(`/admin/checkout-settlements/${opts.settlementId}`);
  }
}

export async function searchRefundConsoleAction(
  query: string,
): Promise<{ ok: true; rows: Awaited<ReturnType<typeof searchRefundConsoleBookings>>['rows'] } | { ok: false; error: string }> {
  try {
    await requireAdminPermission('deposits:write');
    const result = await searchRefundConsoleBookings(query);
    return { ok: true, rows: result.rows };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Search failed.',
    };
  }
}

export async function loadRefundConsoleWorkspaceAction(
  bookingId: string,
): Promise<{ ok: true; workspace: RefundConsoleWorkspaceDTO } | { ok: false; error: string }> {
  try {
    const admin = await requireAdminPermission('deposits:write');
    await assertAdminBookingAccess(admin, bookingId);
    const workspace = await getRefundConsoleWorkspace(bookingId);
    if (!workspace) {
      return { ok: false, error: 'Booking not found.' };
    }
    return { ok: true, workspace: toRefundConsoleWorkspaceDTO(workspace) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not load refund workspace.',
    };
  }
}

export async function listRefundConsoleBookingsForCustomerAction(
  customerId: string,
): Promise<
  | { ok: true; rows: Awaited<ReturnType<typeof listRefundConsoleBookingsForCustomer>> }
  | { ok: false; error: string }
> {
  try {
    await requireAdminPermission('deposits:write');
    const rows = await listRefundConsoleBookingsForCustomer(customerId);
    return { ok: true, rows };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not load bookings.',
    };
  }
}

/** Mark deposit refunded — ledger, wallet, checkout, and all admin views. */
export async function markRefundedAction(
  bookingId: string,
  prev: RefundActionState,
  formData: FormData,
): Promise<RefundActionState> {
  return markRefundPaidAction(bookingId, prev, formData);
}

export async function markRefundPaidAction(
  bookingId: string,
  _prev: RefundActionState,
  formData: FormData,
): Promise<RefundActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
    await assertAdminBookingAccess(admin, bookingId);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Permission denied.' };
  }

  const workspace = await getRefundConsoleWorkspace(bookingId);
  if (!workspace) return { status: 'error', message: 'Booking not found.' };

  const refundReference = String(formData.get('refundReference') ?? formData.get('upiId') ?? '').trim();
  const refundMethod = String(formData.get('refundMethod') ?? formData.get('paymentMethod') ?? 'upi').trim();
  const refundNotes = String(formData.get('refundNotes') ?? '').trim();

  if (!refundReference) {
    return { status: 'error', message: 'Enter UPI ID or payment reference.' };
  }

  const amountFromForm = parseInrPaise(formData, 'finalRefundInr');
  const refundPaise = amountFromForm ?? workspace.suggestedRefundPaise;

  if (refundPaise <= 0) {
    return { status: 'error', message: 'Refund amount must be greater than zero.' };
  }

  if (refundPaise > workspace.refundableBalancePaise) {
    return {
      status: 'error',
      message: `Refund exceeds refundable balance (₹${(workspace.refundableBalancePaise / 100).toFixed(2)} available).`,
    };
  }

  if (workspace.checkout?.status === 'refund_pending') {
    if (workspace.checkout.finalRefundPaise != null && refundPaise !== workspace.checkout.finalRefundPaise) {
      return {
        status: 'error',
        message: `Checkout settlement expects ₹${(workspace.checkout.finalRefundPaise / 100).toFixed(2)} — adjust deductions in checkout first.`,
      };
    }

    const result = await markCheckoutRefundPaid({
      settlementId: workspace.checkout.settlementId,
      adminId: admin.adminId,
      refundReference,
      refundMethod: refundMethod || undefined,
      refundNotes: refundNotes || undefined,
    });
    if (!result.ok) return { status: 'error', message: result.error };

    revalidateRefundConsole(bookingId, {
      settlementId: workspace.checkout.settlementId,
      customerId: workspace.customerId,
    });
    const depositSettlementId = await resolveDepositSettlementForCheckout(workspace.checkout.settlementId);
    return {
      status: 'ok',
      message: 'Refund marked. Checkout completed and removed from Refund Due.',
      receiptSettlementId: depositSettlementId ?? undefined,
    };
  }

  const booking = await resolveBooking(bookingId);
  if (!booking) return { status: 'error', message: 'Booking not found.' };

  const note = refundNotes || `Refund payout via ${refundMethod || 'upi'}`;
  const settlement = await settleDepositRefund({
    bookingId,
    customerId: booking.customerId,
    idempotencyKey: `refund-console:${bookingId}:${randomUUID()}`,
    source: 'admin_panel',
    adminId: admin.adminId,
    reason: note,
    refundPaise,
    markBookingRefunded: true,
    refundAudit: {
      refundMethod: refundMethod || 'upi',
      refundReference,
    },
  });

  if (!settlement.ok) return { status: 'error', message: settlement.error };

  revalidateRefundConsole(bookingId, { customerId: booking.customerId });
  return {
    status: 'ok',
    message: 'Refund marked and deposit ledger updated.',
    receiptSettlementId: settlement.settlementId,
  };
}

/** @deprecated Use markRefundPaidAction — kept for legacy form bindings. */
export async function payRefundAction(
  bookingId: string,
  prev: RefundActionState,
  formData: FormData,
): Promise<RefundActionState> {
  if (!formData.get('finalRefundInr') && formData.get('amountInr')) {
    formData.set('finalRefundInr', String(formData.get('amountInr')));
  }
  if (!formData.get('refundReference') && formData.get('note')) {
    formData.set('refundReference', String(formData.get('note')));
  }
  return markRefundPaidAction(bookingId, prev, formData);
}

export async function deductDepositAction(
  bookingId: string,
  _prev: RefundActionState,
  formData: FormData,
): Promise<RefundActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
    await assertAdminBookingAccess(admin, bookingId);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Permission denied.' };
  }

  const amountPaise = parseInrPaise(formData);
  const note = parseNote(formData, 'reason') ?? parseNote(formData, 'note');
  const categoryRaw = String(formData.get('category') ?? 'other').trim();
  if (amountPaise == null) return { status: 'error', message: 'Enter a valid deduction amount.' };
  if (!note) return { status: 'error', message: 'Add a reason for this deduction.' };
  if (!isDeductionCategory(categoryRaw)) {
    return { status: 'error', message: 'Pick a deduction category.' };
  }
  const category = categoryRaw as DeductionCategory;

  const booking = await resolveBooking(bookingId);
  if (!booking) return { status: 'error', message: 'Booking not found.' };

  const result = await applyDepositDeduction({
    bookingId,
    customerId: booking.customerId,
    amountPaise,
    reason: formatDeductionReason(category, note),
    deductionCategory: category,
    adminId: admin.adminId,
  });
  if (!result.ok) return { status: 'error', message: result.error };

  revalidateRefundConsole(bookingId, { customerId: booking.customerId });
  return { status: 'ok', message: 'Deduction applied to deposit ledger.' };
}

export async function transferDepositAction(
  bookingId: string,
  _prev: RefundActionState,
  formData: FormData,
): Promise<RefundActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
    await assertAdminBookingAccess(admin, bookingId);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Permission denied.' };
  }

  const amountPaise = parseInrPaise(formData);
  const targetBookingId = String(formData.get('targetBookingId') ?? '').trim();
  if (amountPaise == null) return { status: 'error', message: 'Enter a valid transfer amount.' };
  if (!targetBookingId) return { status: 'error', message: 'Enter the target booking id.' };

  const source = await resolveBooking(bookingId);
  if (!source) return { status: 'error', message: 'Source booking not found.' };

  try {
    await assertAdminBookingAccess(admin, targetBookingId);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Target booking access denied.' };
  }

  const transferred = await applyDepositCreditToBooking({
    customerId: source.customerId,
    targetBookingId,
    creditPaise: amountPaise,
    sourceBookingId: bookingId,
  });
  if (!transferred.ok) return { status: 'error', message: transferred.error };

  revalidateRefundConsole(bookingId, { customerId: source.customerId });
  revalidateRefundConsole(targetBookingId);
  return { status: 'ok', message: 'Deposit transferred.' };
}
