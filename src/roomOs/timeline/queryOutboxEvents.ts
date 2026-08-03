/**
 * Read-only outbox query for timeline aggregation — Layer B.
 */

import { and, desc, eq, gte, lt, lte } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsOutbox } from '@/src/db/schema/roomOsOutbox';
import type { OutboxEventRow } from '@/src/roomOs/timeline/formatEntry';

export type QueryOutboxEventsInput = {
  streamType: string;
  streamId: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
};

function mapRow(row: typeof roomOsOutbox.$inferSelect): OutboxEventRow {
  return {
    id: row.id,
    eventId: row.eventId,
    streamType: row.streamType,
    streamId: row.streamId,
    eventType: row.eventType,
    occurredAt: row.occurredAt,
    rulesEffectivePackId: row.rulesEffectivePackId,
    payload: row.payload,
    sourceRef: row.sourceRef,
  };
}

export async function queryOutboxEventsForTimeline(
  input: QueryOutboxEventsInput,
): Promise<OutboxEventRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const conditions = [
    eq(roomOsOutbox.streamType, input.streamType),
    eq(roomOsOutbox.streamId, input.streamId),
  ];

  if (input.from) {
    conditions.push(gte(roomOsOutbox.occurredAt, new Date(input.from)));
  }
  if (input.to) {
    conditions.push(lte(roomOsOutbox.occurredAt, new Date(input.to)));
  }
  if (input.cursor) {
    conditions.push(lt(roomOsOutbox.occurredAt, new Date(input.cursor)));
  }

  const rows = await db
    .select()
    .from(roomOsOutbox)
    .where(and(...conditions))
    .orderBy(desc(roomOsOutbox.occurredAt))
    .limit(limit + 1);

  return rows.map(mapRow);
}
