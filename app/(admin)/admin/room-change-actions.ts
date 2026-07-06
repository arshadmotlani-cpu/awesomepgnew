'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  approveRoomChangeRequest,
  cancelRoomChangeRequest,
} from '@/src/services/roomTransferLifecycle';

export async function approveRoomChangeRequestAction(input: {
  requestId: string;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await requireAdminSession();
  const result = await approveRoomChangeRequest({
    requestId: input.requestId,
    adminId: session.adminId,
    notes: input.notes,
  });
  if (result.ok) revalidatePath('/admin/requests');
  return result;
}

export async function cancelRoomChangeRequestAction(input: {
  requestId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await requireAdminSession();
  const result = await cancelRoomChangeRequest({
    requestId: input.requestId,
    actorType: 'admin',
    actorId: session.adminId,
    reason: input.reason,
  });
  if (result.ok) revalidatePath('/admin/requests');
  return result;
}
