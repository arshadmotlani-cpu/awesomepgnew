'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import {
  recordDepositCollected,
  recordDepositDeducted,
  recordDepositRefunded,
  correctDepositCollected,
} from '@/src/services/deposits';

export type ActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

const idle: ActionState = { status: 'idle' };

async function resolveCustomerId(bookingId: string): Promise<string | null> {
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
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
    await recordDepositDeducted({
      bookingId,
      customerId,
      amountPaise,
      reason,
      createdByAdminId: admin.adminId,
    });
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
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
    await recordDepositRefunded({
      bookingId,
      customerId,
      amountPaise,
      reason,
      createdByAdminId: admin.adminId,
    });
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
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
    const result = await correctDepositCollected({
      bookingId,
      customerId,
      targetCollectedPaise: amountPaise,
      reason: `admin correction: ${reason}`,
      createdByAdminId: admin.adminId,
    });
    revalidateFinancialViews();
    revalidatePath(`/admin/bookings/${bookingId}`);
    return {
      status: 'ok',
      message: `Deposit set to ₹${(result.targetPaise / 100).toLocaleString('en-IN')} (was ₹${(result.previousPaise / 100).toLocaleString('en-IN')}).`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Correction failed.',
    };
  }
}

export const initialActionState = idle;
