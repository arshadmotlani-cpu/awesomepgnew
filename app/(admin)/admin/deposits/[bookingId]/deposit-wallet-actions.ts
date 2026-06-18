'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import {
  cancelDepositInvoice,
  rebuildDepositWallet,
  updateDepositSummaryAdmin,
} from '@/src/services/depositOperations';

export type DepositWalletActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

async function resolveCustomerId(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ customerId: bookings.customerId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row?.customerId ?? null;
}

export async function editDepositSummaryAction(
  _prev: DepositWalletActionState,
  formData: FormData,
): Promise<DepositWalletActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
    const bookingId = String(formData.get('bookingId') ?? '');
    await assertAdminBookingAccess(admin, bookingId);
    const customerId = await resolveCustomerId(bookingId);
    if (!customerId) return { status: 'error', message: 'Booking not found.' };

    const reason = String(formData.get('reason') ?? '').trim();
    if (!reason) return { status: 'error', message: 'Reason is required.' };

    const requiredRaw = String(formData.get('requiredInr') ?? '').trim();
    const collectedRaw = String(formData.get('collectedInr') ?? '').trim();
    const requiredPaise =
      requiredRaw !== '' && Number.isFinite(Number(requiredRaw))
        ? Math.round(Number(requiredRaw) * 100)
        : undefined;
    const collectedPaise =
      collectedRaw !== '' && Number.isFinite(Number(collectedRaw))
        ? Math.round(Number(collectedRaw) * 100)
        : undefined;

    if (requiredPaise == null && collectedPaise == null) {
      return { status: 'error', message: 'Enter required and/or collected amount to update.' };
    }

    const result = await updateDepositSummaryAdmin({
      bookingId,
      customerId,
      adminId: admin.adminId,
      requiredPaise,
      collectedPaise,
      reason,
    });
    if (!result.ok) return { status: 'error', message: result.error };

    revalidateFinancialViews();
    revalidatePath(`/admin/deposits/${bookingId}`);
    return { status: 'ok', message: 'Deposit summary updated everywhere.' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Update failed.' };
  }
}

export async function rebuildDepositWalletAction(
  _prev: DepositWalletActionState,
  formData: FormData,
): Promise<DepositWalletActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
    const bookingId = String(formData.get('bookingId') ?? '');
    await assertAdminBookingAccess(admin, bookingId);
    const customerId = await resolveCustomerId(bookingId);
    if (!customerId) return { status: 'error', message: 'Booking not found.' };

    const result = await rebuildDepositWallet({
      bookingId,
      customerId,
      adminId: admin.adminId,
    });
    if (!result.ok) return { status: 'error', message: result.error };

    revalidateFinancialViews();
    revalidatePath(`/admin/deposits/${bookingId}`);
    return {
      status: 'ok',
      message: `Wallet rebuilt — collected set to ₹${(result.targetCollectedPaise / 100).toLocaleString('en-IN')}.`,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Rebuild failed.' };
  }
}

export async function cancelDepositInvoiceAction(
  _prev: DepositWalletActionState,
  formData: FormData,
): Promise<DepositWalletActionState> {
  let admin;
  try {
    admin = await requireAdminPermission('deposits:write');
    const bookingId = String(formData.get('bookingId') ?? '');
    const confirm = String(formData.get('confirmText') ?? '').trim();
    if (confirm !== 'CANCEL') {
      return { status: 'error', message: 'Type CANCEL to confirm.' };
    }
    await assertAdminBookingAccess(admin, bookingId);
    const customerId = await resolveCustomerId(bookingId);
    if (!customerId) return { status: 'error', message: 'Booking not found.' };

    const result = await cancelDepositInvoice({
      bookingId,
      customerId,
      adminId: admin.adminId,
      reason: 'Admin cancelled deposit invoice',
    });
    if (!result.ok) return { status: 'error', message: result.error };

    revalidateFinancialViews();
    revalidatePath(`/admin/deposits/${bookingId}`);
    revalidatePath('/admin/deposits');
    return { status: 'ok', message: 'Deposit invoice cancelled — wallet zeroed everywhere.' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Cancel failed.' };
  }
}
