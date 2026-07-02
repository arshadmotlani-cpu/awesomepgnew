'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import {
  DEDUCTION_CATEGORIES,
  formatDeductionReason,
  isDeductionCategory,
  type DeductionCategory,
} from '@/src/lib/financial/deductionCategories';
import { applyDepositCreditToBooking } from '@/src/services/depositCredit';
import { applyDepositDeduction, settleDepositRefund } from '@/src/services/depositSettlement';

export type RefundActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export const initialRefundActionState: RefundActionState = { status: 'idle' };

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

function parseInrPaise(form: FormData, field = 'amountInr'): number | null {
  const raw = String(form.get(field) ?? '');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function parseNote(form: FormData): string | null {
  const raw = String(form.get('note') ?? '').trim();
  return raw.length > 0 ? raw : null;
}

function revalidateRefundConsole(bookingId: string) {
  revalidatePath('/admin/refunds');
  revalidatePath(`/admin/refunds?booking=${bookingId}`);
  revalidateFinancialViews();
}

export async function payRefundAction(
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
  const note = parseNote(formData);
  if (amountPaise == null) return { status: 'error', message: 'Enter a valid refund amount.' };
  if (!note) return { status: 'error', message: 'Add a short note for this refund.' };

  const booking = await resolveBooking(bookingId);
  if (!booking) return { status: 'error', message: 'Booking not found.' };

  const settlement = await settleDepositRefund({
    bookingId,
    customerId: booking.customerId,
    idempotencyKey: `refund-console:${bookingId}:${randomUUID()}`,
    source: 'admin_panel',
    adminId: admin.adminId,
    reason: note,
    refundPaise: amountPaise,
    refundAudit: {
      refundMethod: formData.get('refundMethod')?.toString()?.trim() || null,
      refundReference: formData.get('refundReference')?.toString()?.trim() || null,
      refundProofUrl: formData.get('refundProofUrl')?.toString()?.trim() || null,
    },
  });

  if (!settlement.ok) return { status: 'error', message: settlement.error };
  revalidateRefundConsole(bookingId);
  return { status: 'ok', message: 'Refund recorded.' };
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
  const note = parseNote(formData);
  const categoryRaw = String(formData.get('category') ?? '').trim();
  if (amountPaise == null) return { status: 'error', message: 'Enter a valid deduction amount.' };
  if (!note) return { status: 'error', message: 'Add a short note for this deduction.' };
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

  revalidateRefundConsole(bookingId);
  return { status: 'ok', message: 'Deduction recorded.' };
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

  revalidateRefundConsole(bookingId);
  revalidateRefundConsole(targetBookingId);
  return { status: 'ok', message: 'Deposit transferred.' };
}

export { DEDUCTION_CATEGORIES };
