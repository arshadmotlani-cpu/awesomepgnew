/**
 * Process pending outbox rows through registered projectors — Wave 2 operational.
 */

import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsOutbox } from '@/src/db/schema/roomOsOutbox';
import {
  fetchProcessableRoomOsOutboxBatch,
  type RoomOsDb,
} from '@/src/roomOs/outbox/append';
import {
  computeRoomOsOutboxRetryDelayMs,
  isRoomOsOutboxDeadLetter,
  ROOM_OS_OUTBOX_MAX_ATTEMPTS,
} from '@/src/roomOs/outbox/retryPolicy';
import { runProjectorsForEvent } from '@/src/roomOs/projectors/runProjectors';
import type { RoomOsEventEnvelope } from '@/src/roomOs/types';

export type ProcessRoomOsOutboxResult = {
  processed: number;
  failed: number;
  retried: number;
  errors: Array<{ eventId: string; message: string; attemptCount: number }>;
};

export type DrainRoomOsOutboxResult = ProcessRoomOsOutboxResult & {
  batches: number;
  pendingRemaining: number;
};

async function markProcessed(eventId: string, tx: RoomOsDb = db): Promise<void> {
  await tx
    .update(roomOsOutbox)
    .set({
      status: 'processed',
      processedAt: new Date(),
      errorMessage: null,
      attemptCount: 0,
      nextRetryAt: null,
    })
    .where(eq(roomOsOutbox.eventId, eventId));
}

async function markRetryScheduled(
  eventId: string,
  attemptCount: number,
  message: string,
  tx: RoomOsDb = db,
): Promise<void> {
  const delayMs = computeRoomOsOutboxRetryDelayMs(attemptCount);
  await tx
    .update(roomOsOutbox)
    .set({
      status: 'failed',
      processedAt: new Date(),
      errorMessage: message,
      attemptCount,
      nextRetryAt: new Date(Date.now() + delayMs),
    })
    .where(eq(roomOsOutbox.eventId, eventId));
}

async function markPermanentFailed(
  eventId: string,
  attemptCount: number,
  message: string,
  tx: RoomOsDb = db,
): Promise<void> {
  await tx
    .update(roomOsOutbox)
    .set({
      status: 'failed',
      processedAt: new Date(),
      errorMessage: message,
      attemptCount,
      nextRetryAt: null,
    })
    .where(eq(roomOsOutbox.eventId, eventId));
}

async function currentAttemptCount(eventId: string, tx: RoomOsDb = db): Promise<number> {
  const [row] = await tx
    .select({ attemptCount: roomOsOutbox.attemptCount })
    .from(roomOsOutbox)
    .where(eq(roomOsOutbox.eventId, eventId))
    .limit(1);
  return row?.attemptCount ?? 0;
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
  const batch = await fetchProcessableRoomOsOutboxBatch(limit);
  const result: ProcessRoomOsOutboxResult = {
    processed: 0,
    failed: 0,
    retried: 0,
    errors: [],
  };

  for (const event of batch) {
    const priorAttempts = await currentAttemptCount(event.eventId);
    const isRetry = priorAttempts > 0;
    try {
      await processRoomOsOutboxEvent(event);
      result.processed += 1;
      if (isRetry) result.retried += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attemptCount = priorAttempts + 1;
      if (isRoomOsOutboxDeadLetter(attemptCount)) {
        await markPermanentFailed(event.eventId, attemptCount, message);
      } else {
        await markRetryScheduled(event.eventId, attemptCount, message);
      }
      result.failed += 1;
      result.errors.push({ eventId: event.eventId, message, attemptCount });
    }
  }

  return result;
}

export async function countPendingRoomOsOutbox(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(roomOsOutbox)
    .where(
      and(
        eq(roomOsOutbox.status, 'pending'),
        or(isNull(roomOsOutbox.nextRetryAt), lte(roomOsOutbox.nextRetryAt, sql`now()`)),
      ),
    );
  return row?.count ?? 0;
}

/** Drain processable outbox rows until empty or max batch iterations. */
export async function drainRoomOsOutbox(input?: {
  batchSize?: number;
  maxBatches?: number;
}): Promise<DrainRoomOsOutboxResult> {
  const batchSize = input?.batchSize ?? 50;
  const maxBatches = input?.maxBatches ?? 20;
  const aggregate: DrainRoomOsOutboxResult = {
    processed: 0,
    failed: 0,
    retried: 0,
    errors: [],
    batches: 0,
    pendingRemaining: 0,
  };

  for (let i = 0; i < maxBatches; i += 1) {
    const batchResult = await processRoomOsOutboxBatch(batchSize);
    aggregate.batches += 1;
    aggregate.processed += batchResult.processed;
    aggregate.failed += batchResult.failed;
    aggregate.retried += batchResult.retried;
    aggregate.errors.push(...batchResult.errors);
    if (batchResult.processed + batchResult.failed === 0) break;
  }

  aggregate.pendingRemaining = await countPendingRoomOsOutbox();
  return aggregate;
}

export { ROOM_OS_OUTBOX_MAX_ATTEMPTS };
