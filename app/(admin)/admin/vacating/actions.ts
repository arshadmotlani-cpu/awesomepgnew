'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  adminWithdrawVacatingRequest,
  approveVacatingRequest,
  completeVacatingRequest,
  rejectVacatingRequest,
  revertVacatingApproval,
  revertVacatingCompletion,
} from '@/src/services/vacating';

export type ActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

function revalidateVacatingPaths() {
  revalidatePath('/admin/vacating');
  revalidatePath('/admin/deposits');
  revalidatePath('/admin/rent');
  revalidatePath('/admin/pgs');
}

function completeErrorMessage(kind: string, message?: string): string {
  if (kind === 'bed_not_occupied') {
    return (
      message ??
      'This bed is already vacant. Use Cancel notice instead of Complete.'
    );
  }
  return `Failed: ${kind}`;
}

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
  revalidateVacatingPaths();
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
  revalidateVacatingPaths();
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
    if (result.kind === 'bed_not_occupied') {
      return { status: 'error', message: completeErrorMessage(result.kind, result.message) };
    }
    return { status: 'error', message: completeErrorMessage(result.kind) };
  }
  revalidateVacatingPaths();
  return {
    status: 'ok',
    message: `Completed: deduction ${result.deductionPaise}p, refund ${result.depositRefundPaise}p, ${result.futureInvoicesCancelled} future rent invoices cancelled, ${result.electricityInvoicesCancelled} electricity invoices cancelled.`,
  };
}

export async function undoVacatingCompletionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const requestId = String(formData.get('requestId') ?? '');
  const pgId = String(formData.get('pgId') ?? '');
  const result = await revertVacatingCompletion({
    requestId,
    resolvedByAdminId: admin.adminId,
  });
  if (!result.ok) {
    if (result.kind === 'bed_reassigned') {
      return { status: 'error', message: result.message };
    }
    return { status: 'error', message: `Undo failed: ${result.kind}` };
  }
  revalidateVacatingPaths();
  if (pgId) revalidatePath(`/admin/pgs/${pgId}/map`);
  return {
    status: 'ok',
    message: 'Vacating completion undone — booking and bed restored.',
  };
}

export async function cancelVacatingNoticeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const requestId = String(formData.get('requestId') ?? '');
  const pgId = String(formData.get('pgId') ?? '');
  const result = await adminWithdrawVacatingRequest({
    requestId,
    resolvedByAdminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: `Cancel failed: ${result.kind}` };
  }
  revalidateVacatingPaths();
  if (pgId) revalidatePath(`/admin/pgs/${pgId}/map`);
  return { status: 'ok', message: 'Vacating notice removed.' };
}

export async function undoVacatingApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const requestId = String(formData.get('requestId') ?? '');
  const pgId = String(formData.get('pgId') ?? '');
  const result = await revertVacatingApproval({
    requestId,
    resolvedByAdminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: `Undo failed: ${result.kind}` };
  }
  revalidateVacatingPaths();
  if (pgId) revalidatePath(`/admin/pgs/${pgId}/map`);
  return { status: 'ok', message: 'Approval undone — notice is pending again.' };
}
