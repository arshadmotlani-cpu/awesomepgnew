'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { archiveResident, updateTenantTenancy } from '@/src/services/residentAdmin';

export async function archiveResidentAction(
  customerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminPermission('bookings:write');
  const result = await archiveResident(session, customerId);
  if (!result.ok) return result;
  revalidatePath('/admin/residents');
  return { ok: true };
}

export type UpdateTenancyState = { ok: boolean; error?: string };

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

    const customerId = formData.get('customerId')?.toString()?.trim();
    const pgId = formData.get('pgId')?.toString()?.trim();
    revalidatePath('/admin/residents');
    if (customerId) revalidatePath(`/admin/residents/${customerId}`);
    revalidatePath('/admin/bookings');
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath(`/admin/deposits/${bookingId}`);
    revalidatePath('/admin/deposits');
    revalidatePath('/pgs');
    if (pgId) revalidatePath(`/admin/pgs/${pgId}/map`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
