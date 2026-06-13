'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { executeActionItemAction } from '@/src/services/actionExecution';
import {
  getActionItemDetail,
  syncActionItems,
  updateActionItemStatus,
} from '@/src/services/actionItems';

export type ActionCenterActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string; url?: string; qrUrl?: string; whatsappUrl?: string | null }
  | { status: 'error'; message: string };

export async function syncActionItemsAction(): Promise<ActionCenterActionState> {
  const session = await requireAdminSession('/admin/actions');
  await syncActionItems(session);
  revalidatePath('/admin/actions');
  revalidatePath('/admin');
  return { status: 'ok', message: 'Action items refreshed.' };
}

export async function markActionResolvedAction(
  _prev: ActionCenterActionState,
  formData: FormData,
): Promise<ActionCenterActionState> {
  const session = await requireAdminSession('/admin/actions');
  const actionItemId = String(formData.get('actionItemId') ?? '');
  const result = await updateActionItemStatus(session, actionItemId, 'resolved');
  if (!result.ok) return { status: 'error', message: result.message ?? 'Could not update.' };
  revalidatePath('/admin/actions');
  return { status: 'ok', message: 'Marked resolved.' };
}

export async function executeActionItemActionServer(
  _prev: ActionCenterActionState,
  formData: FormData,
): Promise<ActionCenterActionState> {
  const session = await requireAdminSession('/admin/actions');
  const actionItemId = String(formData.get('actionItemId') ?? '');
  const actionType = String(formData.get('actionType') ?? '');

  const detail = await getActionItemDetail(session, actionItemId);
  if (!detail) return { status: 'error', message: 'Action item not found.' };

  const result = await executeActionItemAction({ actionType, detail });
  if (!result.ok) return { status: 'error', message: result.message };

  if (result.kind === 'url') {
    return { status: 'ok', message: `Opening ${result.label}…`, url: result.url };
  }
  if (result.kind === 'payment_link') {
    return {
      status: 'ok',
      message: 'Payment link generated.',
      qrUrl: result.qrUrl,
      whatsappUrl: result.whatsappUrl,
    };
  }
  return { status: 'ok', message: result.message };
}

export async function loadActionItemDetailAction(actionItemId: string) {
  const session = await requireAdminSession('/admin/actions');
  return getActionItemDetail(session, actionItemId);
}
