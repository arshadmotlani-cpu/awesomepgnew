'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  approveVacatingRequest,
  completeVacatingRequest,
  rejectVacatingRequest,
} from '@/src/services/vacating';

export type ActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export async function approveVacatingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const requestId = String(formData.get('requestId') ?? '');
  const result = await approveVacatingRequest({
    requestId,
    resolvedByAdminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: `Failed: ${result.kind}` };
  }
  revalidatePath('/admin/vacating');
  return { status: 'ok', message: 'Approved.' };
}

export async function rejectVacatingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const requestId = String(formData.get('requestId') ?? '');
  const reason = String(formData.get('reason') ?? 'admin rejected');
  const result = await rejectVacatingRequest({
    requestId,
    reason,
    resolvedByAdminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: `Failed: ${result.kind}` };
  }
  revalidatePath('/admin/vacating');
  return { status: 'ok', message: 'Rejected.' };
}

export async function completeVacatingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const requestId = String(formData.get('requestId') ?? '');
  const result = await completeVacatingRequest({
    requestId,
    resolvedByAdminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: `Failed: ${result.kind}` };
  }
  revalidatePath('/admin/vacating');
  revalidatePath('/admin/deposits');
  revalidatePath('/admin/rent');
  return {
    status: 'ok',
    message: `Completed: deduction ${result.deductionPaise}p, refund ${result.depositRefundPaise}p, ${result.futureInvoicesCancelled} future rent invoices cancelled, ${result.electricityInvoicesCancelled} electricity invoices cancelled.`,
  };
}
