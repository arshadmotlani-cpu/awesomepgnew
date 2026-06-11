'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assignTenantToBed } from '@/src/services/tenantAssignment';

export type AssignTenantState = {
  ok: boolean;
  error?: string;
  bookingId?: string;
};

export async function assignTenantAction(
  _prev: AssignTenantState,
  formData: FormData,
): Promise<AssignTenantState> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const gender = formData.get('gender')?.toString();
    if (gender !== 'male' && gender !== 'female' && gender !== 'other') {
      return { ok: false, error: 'Select gender.' };
    }

    const monthlyRaw = formData.get('monthlyRentInr')?.toString()?.trim();
    const depositRaw = formData.get('depositInr')?.toString()?.trim();

    const customerId = formData.get('customerId')?.toString()?.trim() || undefined;

    const result = await assignTenantToBed(session, {
      bedId: formData.get('bedId')?.toString() ?? '',
      startDate: formData.get('startDate')?.toString() ?? '',
      customerId,
      fullName: formData.get('fullName')?.toString() ?? '',
      email: formData.get('email')?.toString() ?? '',
      phone: formData.get('phone')?.toString() ?? '',
      gender,
      monthlyRentInr: monthlyRaw ? Number.parseFloat(monthlyRaw) : undefined,
      depositInr: depositRaw ? Number.parseFloat(depositRaw) : undefined,
      blocksWholeRoom: formData.get('blocksWholeRoom') === 'on',
      notes: formData.get('notes')?.toString(),
    });

    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath('/admin/bookings');
    revalidatePath('/pgs');
    revalidatePath('/admin/residents');
    if (customerId) {
      revalidatePath(`/admin/residents/${customerId}`);
      redirect(`/admin/residents/${customerId}?assigned=1`);
    }
    redirect(`/admin/bookings/${result.bookingId}?assigned=1`);
  } catch (err) {
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
