'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { loadControlBoardDrillDown } from '@/src/services/controlBoard';
import { executeActionItemAction } from '@/src/services/actionExecution';
import {
  getActionItemDetail,
  syncActionItems,
  updateActionItemStatus,
} from '@/src/services/actionItems';

export type OverviewActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string; url?: string; qrUrl?: string; whatsappUrl?: string | null }
  | { status: 'error'; message: string };

export async function loadDrillDownAction(drillDownKey: string, billingMonth: string) {
  const session = await requireAdminSession('/admin/overview');
  return loadControlBoardDrillDown(session, drillDownKey, billingMonth);
}

export async function syncOverviewAction(): Promise<OverviewActionState> {
  const session = await requireAdminSession('/admin/overview');
  await syncActionItems(session);
  revalidatePath('/admin/overview');
  revalidatePath('/admin');
  return { status: 'ok', message: 'Control board refreshed.' };
}

export async function markActionResolvedOverviewAction(
  _prev: OverviewActionState,
  formData: FormData,
): Promise<OverviewActionState> {
  const session = await requireAdminSession('/admin/overview');
  const actionItemId = String(formData.get('actionItemId') ?? '');
  const result = await updateActionItemStatus(session, actionItemId, 'resolved');
  if (!result.ok) return { status: 'error', message: result.message ?? 'Could not update.' };
  revalidatePath('/admin/overview');
  return { status: 'ok', message: 'Marked resolved.' };
}

export async function executeOverviewActionServer(
  _prev: OverviewActionState,
  formData: FormData,
): Promise<OverviewActionState> {
  const session = await requireAdminSession('/admin/overview');
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

export async function loadActionItemDetailOverviewAction(actionItemId: string) {
  const session = await requireAdminSession('/admin/overview');
  return getActionItemDetail(session, actionItemId);
}
