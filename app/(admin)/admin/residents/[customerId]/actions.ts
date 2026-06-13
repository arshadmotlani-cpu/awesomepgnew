'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { syncActionItems } from '@/src/services/actionItems';
import { createPaymentLink } from '@/src/services/paymentLinks';
import { archiveResident, updateTenantTenancy } from '@/src/services/residentAdmin';

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

export async function updateTenancyAction(
  _prev: UpdateTenancyState,
  formData: FormData,
): Promise<UpdateTenancyState> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const bookingId = formData.get('bookingId')?.toString() ?? '';
    const monthlyRaw = formData.get('monthlyRentInr')?.toString()?.trim();
    const depositRaw = formData.get('depositCollectedInr')?.toString()?.trim();
    const newBedId = formData.get('newBedId')?.toString()?.trim();

    const result = await updateTenantTenancy(session, {
      bookingId,
      newBedId: newBedId || undefined,
      monthlyRentInr: monthlyRaw ? Number.parseFloat(monthlyRaw) : undefined,
      depositCollectedInr: depositRaw ? Number.parseFloat(depositRaw) : undefined,
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
