'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { syncActionItems } from '@/src/services/actionItems';
import { createPaymentLink } from '@/src/services/paymentLinks';
import { archiveResident, updateBookingMoveInDate, updateRentDueDateOverride, updateTenantTenancy } from '@/src/services/residentAdmin';

const SYNC_PATHS = [
  '/admin/residents',
  '/admin/bookings',
  '/admin/deposits',
  '/admin/overview',
  '/admin/revenue',
  '/admin/collections',
  '/admin/operations',
  '/admin/panel',
] as const;

function revalidateOperationalPaths(customerId?: string, bookingId?: string, pgId?: string) {
  for (const path of SYNC_PATHS) {
    revalidatePath(path);
  }
  if (customerId) revalidatePath(`/admin/residents/${customerId}`);
  if (bookingId) {
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath(`/admin/deposits/${bookingId}`);
  }
  if (pgId) revalidatePath(`/admin/pgs/${pgId}/map`);
  revalidatePath('/pgs');
}

export async function archiveResidentAction(
  customerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminPermission('bookings:write');
  const result = await archiveResident(session, customerId);
  if (!result.ok) return result;
  revalidateOperationalPaths(customerId);
  return { ok: true };
}

export type UpdateTenancyState = {
  ok: boolean;
  error?: string;
  rentChanged?: { fromPaise: number; toPaise: number };
  paymentLinkUrl?: string;
  pgName?: string;
  pgId?: string;
  customerId?: string;
  bookingId?: string;
  roomNumber?: string;
  customerName?: string;
  customerPhone?: string;
};

export type UpdateMoveInState = {
  ok: boolean;
  error?: string;
  invoicesUpdated?: number;
  billingDay?: number;
};

export type UpdateRentDueState = {
  ok: boolean;
  error?: string;
  billingDay?: number;
};

export async function updateRentDueDateAction(
  _prev: UpdateRentDueState,
  formData: FormData,
): Promise<UpdateRentDueState> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const bookingId = formData.get('bookingId')?.toString() ?? '';
    const customerId = formData.get('customerId')?.toString() ?? '';
    const nextDueDate = formData.get('nextDueDate')?.toString()?.trim() ?? '';
    const reason = formData.get('reason')?.toString()?.trim() ?? '';

    if (!bookingId || !nextDueDate || !reason) {
      return { ok: false, error: 'Due date and reason are required.' };
    }

    const result = await updateRentDueDateOverride(session, { bookingId, nextDueDate, reason });
    if (!result.ok) return result;

    revalidateOperationalPaths(customerId, bookingId);
    revalidatePath('/admin/revenue/billing');
    revalidatePath('/admin/revenue/rent-due');
    revalidatePath('/admin/deposits/collected');
    await syncActionItems(session).catch(() => undefined);

    return { ok: true, billingDay: result.billingDay };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not update due date.' };
  }
}

export async function updateMoveInDateAction(
  _prev: UpdateMoveInState,
  formData: FormData,
): Promise<UpdateMoveInState> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const bookingId = formData.get('bookingId')?.toString() ?? '';
    const customerId = formData.get('customerId')?.toString() ?? '';
    const moveInDate = formData.get('moveInDate')?.toString()?.trim() ?? '';

    if (!bookingId || !moveInDate) {
      return { ok: false, error: 'Booking and check-in date are required.' };
    }

    const result = await updateBookingMoveInDate(session, { bookingId, moveInDate });
    if (!result.ok) return result;

    revalidateOperationalPaths(customerId, bookingId);
    revalidatePath('/admin/revenue/billing');
    revalidatePath('/admin/invoices');
    await syncActionItems(session).catch(() => undefined);

    return {
      ok: true,
      invoicesUpdated: result.invoicesUpdated,
      billingDay: result.billingDay,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not update check-in.' };
  }
}

export async function updateTenancyAction(
  _prev: UpdateTenancyState,
  formData: FormData,
): Promise<UpdateTenancyState> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const bookingId = formData.get('bookingId')?.toString() ?? '';
    const newBedId = formData.get('newBedId')?.toString()?.trim();

    const result = await updateTenantTenancy(session, {
      bookingId,
      newBedId: newBedId || undefined,
      blocksWholeRoom: formData.get('blocksWholeRoom') === 'on',
    });

    if (!result.ok) return result;

    await syncActionItems(session).catch(() => undefined);

    let paymentLinkUrl: string | undefined;
    if (result.rentChanged) {
      const customerName = formData.get('customerName')?.toString() ?? 'Resident';
      const customerPhone = formData.get('customerPhone')?.toString() ?? '';
      const linkRes = await createPaymentLink({
        residentId: result.customerId,
        pgId: result.pgId,
        pgName: result.pgName,
        residentName: customerName,
        residentPhone: customerPhone,
        amountPaise: result.rentChanged.toPaise,
        purpose: 'rent',
        roomNumber: result.roomNumber,
        rentUpdated: true,
      });
      if (linkRes.ok) paymentLinkUrl = linkRes.publicUrl;
    }

    revalidateOperationalPaths(result.customerId, bookingId, result.pgId);

    const customerId = result.customerId;
    if (customerId) {
      const currentBedId = formData.get('currentBedId')?.toString()?.trim() ?? '';
      const bedChanged = Boolean(newBedId && currentBedId && newBedId !== currentBedId);
      const params = new URLSearchParams();

      if (result.rentChanged) {
        params.set('rentUpdated', '1');
        params.set('rentFrom', String(result.rentChanged.fromPaise));
        params.set('rentTo', String(result.rentChanged.toPaise));
        if (paymentLinkUrl) params.set('paymentLink', paymentLinkUrl);
        else params.set('linkError', '1');
      }
      if (bedChanged) params.set('bedReassigned', '1');
      if (!result.rentChanged && !bedChanged) params.set('saved', '1');

      const qs = params.toString();
      redirect(qs ? `/admin/residents/${customerId}?${qs}` : `/admin/residents/${customerId}`);
    }

    return {
      ok: true,
      rentChanged: result.rentChanged,
      paymentLinkUrl,
      pgName: result.pgName,
      pgId: result.pgId,
      customerId: result.customerId,
      bookingId,
      roomNumber: result.roomNumber,
      customerName: formData.get('customerName')?.toString(),
      customerPhone: formData.get('customerPhone')?.toString(),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
