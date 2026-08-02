/**
 * Room OS outbox metrics — monitoring and production audit gates.
 */

import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsOutbox } from '@/src/db/schema/roomOsOutbox';
import {
  isRoomOsOutboxDeadLetter,
  ROOM_OS_OUTBOX_MAX_ATTEMPTS,
} from '@/src/roomOs/outbox/retryPolicy';

export type RoomOsOutboxMetrics = {
  pending: number;
  processed: number;
  failedRetryable: number;
  deadLetter: number;
  oldestPendingAgeMs: number | null;
  oldestDeadLetterAgeMs: number | null;
};

export async function getRoomOsOutboxMetrics(): Promise<RoomOsOutboxMetrics> {
  const [counts] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${roomOsOutbox.status} = 'pending' and (${roomOsOutbox.nextRetryAt} is null or ${roomOsOutbox.nextRetryAt} <= now()))::int`,
      processed: sql<number>`count(*) filter (where ${roomOsOutbox.status} = 'processed')::int`,
      failedRetryable: sql<number>`count(*) filter (where ${roomOsOutbox.status} = 'failed' and ${roomOsOutbox.attemptCount} < ${ROOM_OS_OUTBOX_MAX_ATTEMPTS})::int`,
      deadLetter: sql<number>`count(*) filter (where ${roomOsOutbox.status} = 'failed' and ${roomOsOutbox.attemptCount} >= ${ROOM_OS_OUTBOX_MAX_ATTEMPTS})::int`,
      oldestPendingMs: sql<number | null>`extract(epoch from (now() - min(${roomOsOutbox.createdAt}) filter (where ${roomOsOutbox.status} = 'pending' and (${roomOsOutbox.nextRetryAt} is null or ${roomOsOutbox.nextRetryAt} <= now())))) * 1000`,
      oldestDeadLetterMs: sql<number | null>`extract(epoch from (now() - min(${roomOsOutbox.processedAt}) filter (where ${roomOsOutbox.status} = 'failed' and ${roomOsOutbox.attemptCount} >= ${ROOM_OS_OUTBOX_MAX_ATTEMPTS}))) * 1000`,
    })
    .from(roomOsOutbox);

  return {
    pending: counts?.pending ?? 0,
    processed: counts?.processed ?? 0,
    failedRetryable: counts?.failedRetryable ?? 0,
    deadLetter: counts?.deadLetter ?? 0,
    oldestPendingAgeMs:
      counts?.oldestPendingMs != null ? Math.round(counts.oldestPendingMs) : null,
    oldestDeadLetterAgeMs:
      counts?.oldestDeadLetterMs != null ? Math.round(counts.oldestDeadLetterMs) : null,
  };
}

export type RoomOsOutboxHealthInput = {
  maxPending?: number;
  maxOldestPendingMs?: number;
  maxDeadLetter?: number;
};

export function evaluateRoomOsOutboxHealth(
  metrics: RoomOsOutboxMetrics,
  input: RoomOsOutboxHealthInput = {},
): { pass: boolean; mismatches: string[] } {
  const maxPending = input.maxPending ?? 100;
  const maxOldestPendingMs = input.maxOldestPendingMs ?? 30 * 60 * 1000;
  const maxDeadLetter = input.maxDeadLetter ?? 0;
  const mismatches: string[] = [];

  if (metrics.pending > maxPending) {
    mismatches.push(`Pending outbox ${metrics.pending} exceeds ${maxPending}`);
  }
  if (
    metrics.oldestPendingAgeMs != null &&
    metrics.oldestPendingAgeMs > maxOldestPendingMs
  ) {
    mismatches.push(
      `Oldest pending outbox age ${metrics.oldestPendingAgeMs}ms exceeds ${maxOldestPendingMs}ms`,
    );
  }
  if (metrics.deadLetter > maxDeadLetter) {
    mismatches.push(`Dead-letter outbox rows ${metrics.deadLetter} exceeds ${maxDeadLetter}`);
  }

  return { pass: mismatches.length === 0, mismatches };
}

/** Count rows eligible for processing now (for cron responses). */
export async function countProcessableRoomOsOutbox(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(roomOsOutbox)
    .where(
      or(
        and(
          eq(roomOsOutbox.status, 'pending'),
          or(isNull(roomOsOutbox.nextRetryAt), lte(roomOsOutbox.nextRetryAt, sql`now()`)),
        ),
        and(
          eq(roomOsOutbox.status, 'failed'),
          sql`${roomOsOutbox.attemptCount} < ${ROOM_OS_OUTBOX_MAX_ATTEMPTS}`,
          lte(roomOsOutbox.nextRetryAt, sql`now()`),
        ),
      ),
    );
  return row?.count ?? 0;
}

export { isRoomOsOutboxDeadLetter };
