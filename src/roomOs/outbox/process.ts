/**
 * Process pending outbox rows through registered projectors — Wave 0 skeleton.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsOutbox } from '@/src/db/schema/roomOsOutbox';
import {
  fetchPendingRoomOsOutboxBatch,
  type RoomOsDb,
} from '@/src/roomOs/outbox/append';
import { runProjectorsForEvent } from '@/src/roomOs/projectors/runProjectors';
import type { RoomOsEventEnvelope } from '@/src/roomOs/types';

export type ProcessRoomOsOutboxResult = {
  processed: number;
  failed: number;
  errors: Array<{ eventId: string; message: string }>;
};

async function markProcessed(eventId: string, tx: RoomOsDb = db): Promise<void> {
  await tx
    .update(roomOsOutbox)
    .set({ status: 'processed', processedAt: new Date(), errorMessage: null })
    .where(eq(roomOsOutbox.eventId, eventId));
}

async function markFailed(
  eventId: string,
  message: string,
  tx: RoomOsDb = db,
): Promise<void> {
  await tx
    .update(roomOsOutbox)
    .set({ status: 'failed', processedAt: new Date(), errorMessage: message })
    .where(eq(roomOsOutbox.eventId, eventId));
}

export async function processRoomOsOutboxEvent(
  event: RoomOsEventEnvelope,
  tx: RoomOsDb = db,
): Promise<void> {
  await runProjectorsForEvent(event);
  await markProcessed(event.eventId, tx);
}

export async function processRoomOsOutboxBatch(
  limit = 50,
): Promise<ProcessRoomOsOutboxResult> {
  const batch = await fetchPendingRoomOsOutboxBatch(limit);
  const result: ProcessRoomOsOutboxResult = {
    processed: 0,
    failed: 0,
    errors: [],
  };

  for (const event of batch) {
    try {
      await processRoomOsOutboxEvent(event);
      result.processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markFailed(event.eventId, message);
      result.failed += 1;
      result.errors.push({ eventId: event.eventId, message });
    }
  }

  return result;
}
