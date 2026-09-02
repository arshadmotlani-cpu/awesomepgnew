'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { cancelRoomChangeRequest } from '@/src/services/roomTransferLifecycle';

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
