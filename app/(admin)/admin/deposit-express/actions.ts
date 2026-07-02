'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import type { DepositExpressActionState } from '@/app/(admin)/admin/deposit-express/actionState';
import {
  executeDepositExpress,
  listDepositExpressBookingsForCustomer,
  loadDepositExpressContext,
  searchDepositExpressResidents,
  type DepositExpressContext,
  type DepositExpressPaymentMethod,
} from '@/src/services/depositExpress';

function revalidateDepositExpress(_bookingId: string) {
  revalidatePath('/admin/deposit-express');
  revalidatePath('/admin/operations');
  revalidatePath('/admin/operations?filter=deposit_due');
  revalidatePath('/admin/residents');
  revalidatePath('/admin/deposits');
  revalidateFinancialViews();
}

export async function searchDepositExpressAction(
  query: string,
): Promise<
  | { ok: true; rows: Awaited<ReturnType<typeof searchDepositExpressResidents>>['rows'] }
  | { ok: false; error: string }
> {
  try {
    await requireAdminPermission('deposits:write');
    const result = await searchDepositExpressResidents(query);
    return { ok: true, rows: result.rows };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Search failed.' };
  }
}

export async function loadDepositExpressContextAction(
  bookingId: string,
): Promise<{ ok: true; context: DepositExpressContext } | { ok: false; error: string }> {
  try {
    const admin = await requireAdminPermission('deposits:write');
    await assertAdminBookingAccess(admin, bookingId);
    const context = await loadDepositExpressContext(bookingId);
    if (!context) return { ok: false, error: 'Booking not found.' };
    return { ok: true, context };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not load workspace.' };
  }
}

export async function listDepositExpressBookingsAction(
  customerId: string,
): Promise<
  | { ok: true; rows: Awaited<ReturnType<typeof listDepositExpressBookingsForCustomer>> }
  | { ok: false; error: string }
> {
  try {
    await requireAdminPermission('deposits:write');
    const rows = await listDepositExpressBookingsForCustomer(customerId);
    return { ok: true, rows };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not list bookings.' };
  }
}

export async function submitDepositExpressAction(
  _prev: DepositExpressActionState,
  formData: FormData,
): Promise<DepositExpressActionState> {
  try {
    const admin = await requireAdminPermission('deposits:write');
    const bookingId = String(formData.get('bookingId') ?? '').trim();
    if (!bookingId) return { status: 'error', message: 'Booking is required.' };
    await assertAdminBookingAccess(admin, bookingId);

    const requiredInr = Number(String(formData.get('requiredDepositInr') ?? ''));
    const paidInr = Number(String(formData.get('paidAmountInr') ?? '0'));
    if (!Number.isFinite(requiredInr) || requiredInr <= 0) {
      return { status: 'error', message: 'Enter a valid required deposit.' };
    }
    if (!Number.isFinite(paidInr) || paidInr < 0) {
      return { status: 'error', message: 'Enter a valid paid amount.' };
    }

    const method = String(formData.get('paymentMethod') ?? 'cash') as DepositExpressPaymentMethod;
    const reference = String(formData.get('reference') ?? '').trim() || null;
    const notes = String(formData.get('notes') ?? '').trim() || null;

    const result = await executeDepositExpress({
      bookingId,
      requiredDepositPaise: Math.round(requiredInr * 100),
      paidAmountPaise: Math.round(paidInr * 100),
      paymentMethod: method,
      reference,
      notes,
      adminId: admin.adminId,
    });

    if (!result.ok) return { status: 'error', message: result.error };

    revalidateDepositExpress(bookingId);
    return { status: 'ok', message: result.message };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not save deposit.',
    };
  }
}
