'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { vacatingDateChangeRequests } from '@/src/db/schema';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { revalidateVacatingLifecycleForBooking } from '@/src/lib/vacating/revalidateVacatingViews';
import type { VacatingActionState } from '@/src/lib/vacating/vacatingActionTypes';

export async function approveVacatingDateChangeAction(
  requestId: string,
): Promise<VacatingActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const { approveVacatingDateChangeRequest } = await import('@/src/services/vacatingDateChange');
  const result = await approveVacatingDateChangeRequest({
    requestId,
    resolvedByAdminId: admin.adminId,
  });
  if (!result.ok) return { status: 'error', message: result.error };

  const [row] = await db
    .select({ bookingId: vacatingDateChangeRequests.bookingId })
    .from(vacatingDateChangeRequests)
    .where(eq(vacatingDateChangeRequests.id, requestId))
    .limit(1);
  if (row?.bookingId) {
    await revalidateVacatingLifecycleForBooking(row.bookingId);
  }

  return { status: 'ok', message: 'Leaving date updated.' };
}

export async function rejectVacatingDateChangeAction(
  requestId: string,
  adminNotes?: string,
): Promise<VacatingActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const { rejectVacatingDateChangeRequest } = await import('@/src/services/vacatingDateChange');
  const result = await rejectVacatingDateChangeRequest({
    requestId,
    resolvedByAdminId: admin.adminId,
    adminNotes,
  });
  if (!result.ok) return { status: 'error', message: result.error };
  return { status: 'ok', message: 'Date change rejected.' };
}
