/**
 * Execute approved room transfers on their scheduled date (admin journey entry).
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, roomChangeRequests, roomTransferBedHolds } from '@/src/db/schema';
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

  await db.transaction(async (tx) => {
    await tx
      .update(roomChangeRequests)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(roomChangeRequests.id, input.requestId));
    await tx
      .update(roomTransferBedHolds)
      .set({ status: 'released', releasedAt: new Date(), updatedAt: new Date() })
      .where(eq(roomTransferBedHolds.roomChangeRequestId, input.requestId));
    await tx.insert(auditLog).values({
      actorType: 'admin',
      actorId: input.adminId,
      entity: 'room_change_request',
      entityId: row.id,
      action: 'transfer_completed',
      diff: {},
    });
  });

  return { ok: true };
}
