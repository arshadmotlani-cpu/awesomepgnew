'use server';

import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  revalidateVacatingLifecycleForBooking,
  revalidateVacatingLifecycleViews,
} from '@/src/lib/vacating/revalidateVacatingViews';
import {
  assertAdminBookingAccess,
  assertAdminVacatingRequestAccess,
} from '@/src/lib/auth/pgAccess';
import {
  adminWithdrawVacatingRequest,
  approveVacatingRequest,
  completeVacatingRequest,
  extendVacatingDate,
  rejectVacatingRequest,
  revertVacatingApproval,
  revertVacatingCompletion,
} from '@/src/services/vacating';
import type { VacatingActionState } from '@/src/lib/vacating/vacatingActionTypes';

function completeErrorMessage(kind: string, message?: string): string {
  if (kind === 'bed_not_occupied') {
    return (
      message ??
      'This bed is already vacant. Use Cancel notice instead of Complete.'
    );
  }
  if (kind === 'settlement_failed' && message) {
    return message;
  }
  return `Failed: ${kind}`;
}

export async function approveVacatingAction(
  _prev: VacatingActionState,
  formData: FormData,
): Promise<VacatingActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const requestId = String(formData.get('requestId') ?? '');
  try {
    await assertAdminVacatingRequestAccess(admin, requestId);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }
  const result = await approveVacatingRequest({
    requestId,
    resolvedByAdminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: `Failed: ${result.kind}` };
  }
  await revalidateVacatingLifecycleForBooking(
    result.request.bookingId,
    result.request.customerId,
  );
  return { status: 'ok', message: 'Approved.' };
}

export async function rejectVacatingAction(
  _prev: VacatingActionState,
  formData: FormData,
): Promise<VacatingActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const requestId = String(formData.get('requestId') ?? '');
  try {
    await assertAdminVacatingRequestAccess(admin, requestId);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }
  const reason = String(formData.get('reason') ?? 'admin rejected');
  const result = await rejectVacatingRequest({
    requestId,
    reason,
    resolvedByAdminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: `Failed: ${result.kind}` };
  }
  await revalidateVacatingLifecycleForBooking(
    result.request.bookingId,
    result.request.customerId,
  );
  return { status: 'ok', message: 'Rejected.' };
}

export async function completeVacatingAction(
  _prev: VacatingActionState,
  formData: FormData,
): Promise<VacatingActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const requestId = String(formData.get('requestId') ?? '');
  try {
    await assertAdminVacatingRequestAccess(admin, requestId);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }
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
  await revalidateVacatingLifecycleForBooking(
    result.request.bookingId,
    result.request.customerId,
  );
  return {
    status: 'ok',
    message: `Completed: deduction ${result.deductionPaise}p, refund ${result.depositRefundPaise}p, ${result.futureInvoicesCancelled} future rent invoices cancelled, ${result.electricityInvoicesCancelled} electricity invoices cancelled.`,
  };
}

export async function undoVacatingCompletionAction(
  _prev: VacatingActionState,
  formData: FormData,
): Promise<VacatingActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const requestId = String(formData.get('requestId') ?? '');
  const pgId = String(formData.get('pgId') ?? '');
  try {
    await assertAdminVacatingRequestAccess(admin, requestId);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }
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
  await revalidateVacatingLifecycleForBooking(
    result.request.bookingId,
    result.request.customerId,
  );
  if (pgId) revalidateVacatingLifecycleViews({ pgId });
  return {
    status: 'ok',
    message: 'Vacating completion undone — booking and bed restored.',
  };
}

export async function cancelVacatingNoticeAction(
  _prev: VacatingActionState,
  formData: FormData,
): Promise<VacatingActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const requestId = String(formData.get('requestId') ?? '');
  const pgId = String(formData.get('pgId') ?? '');
  try {
    await assertAdminVacatingRequestAccess(admin, requestId);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }
  const result = await adminWithdrawVacatingRequest({
    requestId,
    resolvedByAdminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: `Cancel failed: ${result.kind}` };
  }
  await revalidateVacatingLifecycleForBooking(result.bookingId);
  if (pgId) revalidateVacatingLifecycleViews({ pgId });
  return { status: 'ok', message: 'Vacating notice removed.' };
}

export async function undoVacatingApprovalAction(
  _prev: VacatingActionState,
  formData: FormData,
): Promise<VacatingActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const requestId = String(formData.get('requestId') ?? '');
  const pgId = String(formData.get('pgId') ?? '');
  try {
    await assertAdminVacatingRequestAccess(admin, requestId);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }
  const result = await revertVacatingApproval({
    requestId,
    resolvedByAdminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: `Undo failed: ${result.kind}` };
  }
  await revalidateVacatingLifecycleForBooking(
    result.request.bookingId,
    result.request.customerId,
  );
  if (pgId) revalidateVacatingLifecycleViews({ pgId });
  return { status: 'ok', message: 'Approval undone — notice is pending again.' };
}

export async function extendVacatingDateAction(
  _prev: VacatingActionState,
  formData: FormData,
): Promise<VacatingActionState> {
  const admin = await requireAdminPermission('vacating:write');
  const bookingId = String(formData.get('bookingId') ?? '');
  const newDate = String(formData.get('newVacatingDate') ?? '');
  try {
    await assertAdminBookingAccess(admin, bookingId);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }
  const result = await extendVacatingDate({
    bookingId,
    newVacatingDate: newDate,
    resolvedByAdminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: result.message };
  }
  await revalidateVacatingLifecycleForBooking(bookingId);
  return { status: 'ok', message: 'Vacate / end date updated — occupancy and revenue synced.' };
}
