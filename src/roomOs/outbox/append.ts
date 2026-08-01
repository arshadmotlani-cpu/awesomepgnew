/**
 * Append Room OS outbox entries — same transaction as ledger writes (target).
 */

import { randomUUID } from 'node:crypto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import * as schema from '@/src/db/schema';
import { roomOsOutbox } from '@/src/db/schema/roomOsOutbox';
import { isRoomOsEventType } from '@/src/roomOs/events/catalog';
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
    })
    .returning();

  return toRoomOsEventEnvelope(row);
}

export async function fetchPendingRoomOsOutboxBatch(
  limit: number,
  tx: RoomOsDb = db,
): Promise<RoomOsEventEnvelope[]> {
  const rows = await tx
    .select()
    .from(roomOsOutbox)
    .where(eq(roomOsOutbox.status, 'pending'))
    .limit(limit);

  return rows.map((row) =>
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
