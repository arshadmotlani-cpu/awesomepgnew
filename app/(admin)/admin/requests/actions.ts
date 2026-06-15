'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { adminReviewResidentRequest } from '@/src/services/residentRequests';
import { syncActionItems } from '@/src/services/actionItems';

export type ReviewRequestState = { ok: boolean; error?: string };

export async function reviewResidentRequestAction(
  _prev: ReviewRequestState,
  formData: FormData,
): Promise<ReviewRequestState> {
  const session = await requireAdminPermission('bookings:write');
  const requestId = formData.get('requestId')?.toString() ?? '';
  const action = formData.get('action')?.toString() as
    | 'under_review'
    | 'approve'
    | 'reject'
    | 'complete'
    | undefined;
  const adminNotes = formData.get('adminNotes')?.toString()?.trim();

  if (!requestId || !action) return { ok: false, error: 'Invalid request.' };

  const result = await adminReviewResidentRequest({
    requestId,
    adminId: session.adminId,
    action,
    adminNotes: adminNotes || undefined,
  });

  if (!result.ok) return { ok: false, error: result.error };

  await syncActionItems(session).catch(() => undefined);
  revalidatePath('/admin/requests');
  revalidatePath('/admin/overview');
  revalidatePath('/admin/deposits');
  redirect('/admin/requests?reviewed=1');
}
