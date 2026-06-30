'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { dismissOperationsQueueItem } from '@/src/services/dismissOperationsQueueItem';
import type { ResidentOpsQueueCategory } from '@/src/lib/residents/residentOperationsDashboard';

export type DismissOperationsQueueState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export async function dismissOperationsQueueItemAction(
  _prev: DismissOperationsQueueState,
  formData: FormData,
): Promise<DismissOperationsQueueState> {
  try {
    const session = await requireAdminSession('/admin/operations');
    if (session.role !== 'super_admin') {
      return { status: 'error', message: 'Only Super Admin can dismiss operational queue items.' };
    }

    const queueItemId = String(formData.get('queueItemId') ?? '').trim();
    if (!queueItemId) return { status: 'error', message: 'Missing queue item.' };

    const category = String(formData.get('category') ?? '') as ResidentOpsQueueCategory;
    const customerId = String(formData.get('customerId') ?? '').trim() || null;
    const bookingId = String(formData.get('bookingId') ?? '').trim() || null;
    const vacatingRequestId = String(formData.get('vacatingRequestId') ?? '').trim() || null;
    const residentName = String(formData.get('residentName') ?? '').trim() || 'Resident';

    const result = await dismissOperationsQueueItem({
      adminId: session.adminId,
      queueItemId,
      customerId,
      bookingId,
      vacatingRequestId,
      category,
      residentName,
    });

    if (!result.ok) return { status: 'error', message: result.error };

    revalidatePath('/admin/operations');
    revalidatePath('/admin/operations');
    revalidatePath('/admin/overview');
    revalidatePath('/admin/checkout-settlements');
    revalidatePath('/admin/actions');

    return {
      status: 'ok',
      message: `Dismissed ${residentName} from Operations (${result.actionItemsClosed} action items, ${result.unresolvedClosed} unresolved, ${result.notificationsArchived} notifications archived, domain rows repaired).`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not dismiss queue item.',
    };
  }
}
