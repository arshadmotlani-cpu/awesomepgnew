/**
 * Event coverage measurement for conditional replay gate (Wave 4).
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsOutbox } from '@/src/db/schema/roomOsOutbox';
import {
  isRoomOsOutboxDeadLetter,
  ROOM_OS_OUTBOX_MAX_ATTEMPTS,
} from '@/src/roomOs/outbox/retryPolicy';
import type { EventCoverageReport } from '@/src/roomOs/replay/types';
import { isReplayEligible, REPLAY_MIN_EVENT_COVERAGE } from '@/src/roomOs/truthLadder';
import { todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';

/** Canonical writer hooks instrumented in Wave 2 — static cross-check count. */
export const WRITER_HOOKS_INSTRUMENTED = 17;

export async function measureEventCoverage(input: {
  pgId: string;
  billingMonth?: string;
}): Promise<EventCoverageReport> {
  const billingMonth = firstOfMonth(input.billingMonth ?? todayString());

  const [counts] = await db
    .select({
      processed: sql<number>`count(*) filter (where ${roomOsOutbox.status} = 'processed' and ${roomOsOutbox.eventType} = 'property_index.rebuild_requested')::int`,
      pending: sql<number>`count(*) filter (where ${roomOsOutbox.status} = 'pending' and ${roomOsOutbox.eventType} = 'property_index.rebuild_requested')::int`,
      failedRetryable: sql<number>`count(*) filter (where ${roomOsOutbox.status} = 'failed' and ${roomOsOutbox.attemptCount} < ${ROOM_OS_OUTBOX_MAX_ATTEMPTS} and ${roomOsOutbox.eventType} = 'property_index.rebuild_requested')::int`,
      deadLetter: sql<number>`count(*) filter (where ${roomOsOutbox.status} = 'failed' and ${roomOsOutbox.attemptCount} >= ${ROOM_OS_OUTBOX_MAX_ATTEMPTS} and ${roomOsOutbox.eventType} = 'property_index.rebuild_requested')::int`,
    })
    .from(roomOsOutbox)
    .where(
      and(
        eq(roomOsOutbox.streamType, 'property'),
        eq(roomOsOutbox.streamId, input.pgId),
        sql`${roomOsOutbox.payload}->>'billingMonth' = ${billingMonth}`,
      ),
    );

  const processed = counts?.processed ?? 0;
  const pending = counts?.pending ?? 0;
  const failedRetryable = counts?.failedRetryable ?? 0;
  const deadLetter = counts?.deadLetter ?? 0;
  const denominator = processed + pending + failedRetryable;
  const ratio = denominator > 0 ? processed / denominator : 0;

  return {
    pgId: input.pgId,
    billingMonth,
    processed,
    pending,
    failedRetryable,
    deadLetter,
    ratio,
    eligible: isReplayEligible(ratio),
    writerHooksInstrumented: WRITER_HOOKS_INSTRUMENTED,
  };
}

export function formatCoverageSkipReason(coverage: EventCoverageReport): string {
  return `Replay skipped — event coverage ${(coverage.ratio * 100).toFixed(1)}% below ${REPLAY_MIN_EVENT_COVERAGE * 100}% threshold (processed=${coverage.processed}, pending=${coverage.pending}, failedRetryable=${coverage.failedRetryable}).`;
}
