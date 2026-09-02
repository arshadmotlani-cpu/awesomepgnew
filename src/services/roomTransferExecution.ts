/**
 * Execute approved room transfers on their scheduled date (admin journey entry).
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, roomChangeRequests } from '@/src/db/schema';
import { listRoomTransfersDueToday } from '@/src/services/roomTransferLifecycle';

export async function listDueRoomTransferOperations(): Promise<
  Awaited<ReturnType<typeof listRoomTransfersDueToday>>
> {
  return listRoomTransfersDueToday();
}

/**
 * Mark transfer journey started — physical bed move remains admin-driven via residentAdmin.
 */
export async function startRoomTransferJourney(input: {
  requestId: string;
  adminId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const [row] = await db
    .select()
    .from(roomChangeRequests)
    .where(eq(roomChangeRequests.id, input.requestId))
    .limit(1);
  if (!row) return { ok: false, message: 'Transfer request not found.' };
  if (row.status !== 'approved') {
    return { ok: false, message: `Transfer is not approved (status: ${row.status}).` };
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'room_change_request',
    entityId: row.id,
    action: 'transfer_journey_started',
    diff: { transferDate: row.expectedTransferDate },
  });

  return { ok: true };
}

export async function completeRoomTransferJourney(input: {
  requestId: string;
  adminId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const [row] = await db
    .select()
    .from(roomChangeRequests)
    .where(eq(roomChangeRequests.id, input.requestId))
    .limit(1);
  if (!row) return { ok: false, message: 'Transfer request not found.' };
  if (row.status === 'completed') return { ok: true };
  if (!['approved', 'submitted', 'waiting'].includes(row.status)) {
    return { ok: false, message: `Transfer is not completable (status: ${row.status}).` };
  }

  const { tryCompleteRoomChangeRequest } = await import('@/src/services/roomTransferLifecycle');
  const result = await tryCompleteRoomChangeRequest(input.requestId);
  if (!result.ok) return { ok: false, message: result.message };
  if (result.status !== 'completed') {
    return {
      ok: false,
      message: `Physical transfer not completed (status: ${result.status}). Ensure charges are settled and the transfer date has been reached.`,
    };
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'room_change_request',
    entityId: row.id,
    action: 'transfer_journey_completed',
    diff: { via: 'tryCompleteRoomChangeRequest' },
  });

  return { ok: true };
}
