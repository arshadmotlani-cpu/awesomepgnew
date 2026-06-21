'use server';

import { revalidatePath } from 'next/cache';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import {
  recordDepositCollected,
  executeReconcileDepositLedger,
  getDepositSummaryForBooking,
} from '@/src/services/deposits';
import { applyDepositDeduction, settleDepositRefund } from '@/src/services/depositSettlement';

export type ActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

const idle: ActionState = { status: 'idle' };

async function resolveCustomerId(bookingId: string): Promise<string | null> {
  const { db } = await import('@/src/db/client');
  const { bookings } = await import('@/src/db/schema');
  const [row] = await db
    .select({ customerId: bookings.customerId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row?.customerId ?? null;
}

function parseAmount(form: FormData): number | null {
  const raw = String(form.get('amountInr') ?? '');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function parseCorrectDepositAmount(form: FormData): number | null {
  const raw = String(form.get('amountInr') ?? '');
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function parseReason(form: FormData): string | null {
  const raw = String(form.get('reason') ?? '').trim();
  return raw.length === 0 ? null : raw;
}

export async function addDepositAction(
  bookingId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
    await assertAdminBookingAccess(admin, bookingId);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Permission denied.',
    };
  }
  const amountPaise = parseAmount(formData);
  const reason = parseReason(formData);
  const method = formData.get('paymentMethod')?.toString()?.trim() || 'cash';
  if (amountPaise == null) return { status: 'error', message: 'Amount must be > 0.' };
  if (!reason) return { status: 'error', message: 'Reason is required.' };
  const customerId = await resolveCustomerId(bookingId);
  if (!customerId) return { status: 'error', message: 'Booking not found.' };
  try {
    await recordDepositCollected({
      bookingId,
      customerId,
      amountPaise,
      reason: `admin ${method}: ${reason}`,
      createdByAdminId: admin.adminId,
    });
    const { syncDepositCollectionFromLedger } = await import('@/src/services/depositCollection');
    await syncDepositCollectionFromLedger(bookingId);
    revalidateFinancialViews();
    return { status: 'ok', message: 'Deposit added to ledger.' };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Add failed.',
    };
  }
}

export async function deductDepositAction(
  bookingId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
    await assertAdminBookingAccess(admin, bookingId);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Permission denied.',
    };
  }
  const amountPaise = parseAmount(formData);
  const reason = parseReason(formData);
  if (amountPaise == null) return { status: 'error', message: 'Amount must be > 0.' };
  if (!reason) return { status: 'error', message: 'Reason is required.' };
  const customerId = await resolveCustomerId(bookingId);
  if (!customerId) return { status: 'error', message: 'Booking not found.' };
  try {
    const summary = await getDepositSummaryForBooking(bookingId);
    if (!summary || amountPaise > summary.refundableBalancePaise) {
      return { status: 'error', message: 'Deduction exceeds refundable deposit balance.' };
    }
    const result = await applyDepositDeduction({
      bookingId,
      customerId,
      amountPaise,
      reason,
      adminId: admin.adminId,
    });
    if (!result.ok) {
      return { status: 'error', message: result.error };
    }
    revalidateFinancialViews();
    return { status: 'ok', message: `Deducted ${reason}.` };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Deduct failed.',
    };
  }
}

export async function refundDepositAction(
  bookingId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
    await assertAdminBookingAccess(admin, bookingId);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Permission denied.',
    };
  }
  const amountPaise = parseAmount(formData);
  const reason = parseReason(formData);
  if (amountPaise == null) return { status: 'error', message: 'Amount must be > 0.' };
  if (!reason) return { status: 'error', message: 'Reason is required.' };
  const customerId = await resolveCustomerId(bookingId);
  if (!customerId) return { status: 'error', message: 'Booking not found.' };
  try {
    const settlement = await settleDepositRefund({
      bookingId,
      customerId,
      idempotencyKey: `manual:${bookingId}:${randomUUID()}`,
      source: 'manual',
      adminId: admin.adminId,
      reason,
      refundPaise: amountPaise,
      refundAudit: {
        refundMethod: formData.get('refundMethod')?.toString()?.trim() || null,
        refundReference: formData.get('refundReference')?.toString()?.trim() || null,
        refundProofUrl: formData.get('refundProofUrl')?.toString()?.trim() || null,
      },
    });
    if (!settlement.ok) {
      return { status: 'error', message: settlement.error };
    }
    revalidateFinancialViews();
    return { status: 'ok', message: 'Refund recorded.' };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Refund failed.',
    };
  }
}

export async function correctDepositAction(
  bookingId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
    await assertAdminBookingAccess(admin, bookingId);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Permission denied.',
    };
  }
  const amountPaise = parseCorrectDepositAmount(formData);
  const reason = parseReason(formData);
  if (amountPaise == null) return { status: 'error', message: 'Amount must be >= 0.' };
  if (!reason) return { status: 'error', message: 'Reason is required.' };
  const customerId = await resolveCustomerId(bookingId);
  if (!customerId) return { status: 'error', message: 'Booking not found.' };
  try {
    const result = await executeReconcileDepositLedger({
      bookingId,
      customerId,
      targetCollectedPaise: amountPaise,
      adminId: admin.adminId,
      reason: `admin ledger reconcile: ${reason}`,
    });
    if (!result.ok) {
      return { status: 'error', message: result.error };
    }
    revalidateFinancialViews();
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath(`/admin/deposits/${bookingId}`);
    const deleted = result.plan.deleteIds.length;
    return {
      status: 'ok',
      message: `Ledger reconciled to ₹${(amountPaise / 100).toLocaleString('en-IN')} (${deleted} old row${deleted === 1 ? '' : 's'} removed, 1 collection recorded).`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Correction failed.',
    };
  }
}

export const initialActionState = idle;
