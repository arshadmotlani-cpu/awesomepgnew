/**
 * Append Room OS outbox entries — same transaction as ledger writes (target).
 */

import { randomUUID } from 'node:crypto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import * as schema from '@/src/db/schema';
import { roomOsOutbox } from '@/src/db/schema/roomOsOutbox';
import { isRoomOsEventType } from '@/src/roomOs/events/catalog';
import {
  isRoomOsOutboxDeadLetter,
  ROOM_OS_OUTBOX_MAX_ATTEMPTS,
} from '@/src/roomOs/outbox/retryPolicy';
import type { RoomOsEventEnvelope, RoomOsStreamType } from '@/src/roomOs/types';

export type RoomOsDb = PostgresJsDatabase<typeof schema>;

export type AppendRoomOsOutboxInput = {
  streamType: RoomOsStreamType;
  streamId: string;
  eventType: string;
  occurredAt?: Date;
  rulesEffectivePackId: string;
  payload?: Record<string, unknown>;
  sourceRef?: string;
  eventId?: string;
};

export function toRoomOsEventEnvelope(row: {
  eventId: string;
  streamType: string;
  streamId: string;
  eventType: string;
  occurredAt: Date;
  createdAt: Date;
  rulesEffectivePackId: string;
  payload: Record<string, unknown>;
  sourceRef: string;
}): RoomOsEventEnvelope {
  return {
    eventId: row.eventId,
    streamType: row.streamType as RoomOsStreamType,
    streamId: row.streamId,
    eventType: row.eventType,
    occurredAt: row.occurredAt.toISOString(),
    recordedAt: row.createdAt.toISOString(),
    rulesEffectivePackId: row.rulesEffectivePackId,
    payload: row.payload,
    sourceRef: row.sourceRef,
  };
}

const processableOutboxWhere = or(
  and(
    eq(roomOsOutbox.status, 'pending'),
    or(isNull(roomOsOutbox.nextRetryAt), lte(roomOsOutbox.nextRetryAt, sql`now()`)),
  ),
  and(
    eq(roomOsOutbox.status, 'failed'),
    sql`${roomOsOutbox.attemptCount} < ${ROOM_OS_OUTBOX_MAX_ATTEMPTS}`,
    lte(roomOsOutbox.nextRetryAt, sql`now()`),
  ),
);

export async function appendRoomOsOutboxEntry(
  input: AppendRoomOsOutboxInput,
  tx: RoomOsDb = db,
): Promise<RoomOsEventEnvelope> {
  if (!isRoomOsEventType(input.eventType)) {
    throw new Error(`Unknown Room OS event type: ${input.eventType}`);
  }

  const eventId = input.eventId ?? randomUUID();
  const occurredAt = input.occurredAt ?? new Date();

  const [row] = await tx
    .insert(roomOsOutbox)
    .values({
      eventId,
      streamType: input.streamType,
      streamId: input.streamId,
      eventType: input.eventType,
      occurredAt,
      rulesEffectivePackId: input.rulesEffectivePackId,
      payload: input.payload ?? {},
      sourceRef: input.sourceRef ?? '',
      status: 'pending',
      attemptCount: 0,
      nextRetryAt: null,
    })
    .returning();

  return toRoomOsEventEnvelope(row);
}

/** @deprecated Use fetchProcessableRoomOsOutboxBatch */
export async function fetchPendingRoomOsOutboxBatch(
  limit: number,
  tx: RoomOsDb = db,
): Promise<RoomOsEventEnvelope[]> {
  return fetchProcessableRoomOsOutboxBatch(limit, tx);
}

export async function fetchProcessableRoomOsOutboxBatch(
  limit: number,
  tx: RoomOsDb = db,
): Promise<RoomOsEventEnvelope[]> {
  const rows = await tx
    .select()
    .from(roomOsOutbox)
    .where(processableOutboxWhere)
    .orderBy(asc(roomOsOutbox.createdAt))
    .limit(limit);

  return rows
    .filter((row) => !isRoomOsOutboxDeadLetter(row.attemptCount))
    .map((row) =>
      toRoomOsEventEnvelope({
        eventId: row.eventId,
        streamType: row.streamType,
        streamId: row.streamId,
        eventType: row.eventType,
        occurredAt: row.occurredAt,
        createdAt: row.createdAt,
        rulesEffectivePackId: row.rulesEffectivePackId,
        payload: row.payload,
        sourceRef: row.sourceRef,
      }),
    );
}
