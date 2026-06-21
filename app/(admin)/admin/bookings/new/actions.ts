'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { revalidateOccupancyViews } from '@/src/lib/occupancyRevalidate';
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
    const customerId = formData.get('customerId')?.toString()?.trim() || undefined;

    let gender = formData.get('gender')?.toString();
    if (customerId) {
      const [row] = await db
        .select({ gender: customers.gender })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);
      if (row?.gender) gender = row.gender;
    }
    if (gender !== 'male' && gender !== 'female' && gender !== 'other') {
      return { ok: false, error: 'Gender missing from resident profile.' };
    }

    const result = await assignTenantToBed(session, {
      bedId: formData.get('bedId')?.toString() ?? '',
      startDate: formData.get('startDate')?.toString() ?? '',
      customerId,
      fullName: formData.get('fullName')?.toString() ?? '',
      email: formData.get('email')?.toString() ?? '',
      phone: formData.get('phone')?.toString() ?? '',
      gender,
      blocksWholeRoom: formData.get('blocksWholeRoom') === 'on',
      notes: formData.get('notes')?.toString(),
    });

    if (!result.ok) return { ok: false, error: result.error };

    revalidateOccupancyViews();
    revalidatePath('/pgs');
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
