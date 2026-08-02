/**
 * Ledger writers → Room OS outbox — enqueue property_index.rebuild_requested in-process.
 * Writers import this module only (not projectors).
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, floors, rooms } from '@/src/db/schema';
import { appendRoomOsOutboxEntry, type RoomOsDb } from '@/src/roomOs/outbox/append';
import { RULES_CATALOG_V1_ID } from '@/src/roomOs/rules/catalog/v1';
import { todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';

export type WriterRebuildInput = {
  pgId: string;
  billingMonth?: string;
  asOf?: string;
  sourceRef: string;
};

export async function resolvePgIdForBed(
  bedId: string,
  tx: RoomOsDb = db,
): Promise<string | null> {
  const [row] = await tx
    .select({ pgId: floors.pgId })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(beds.id, bedId))
    .limit(1);
  return row?.pgId ?? null;
}

export async function resolvePgIdForRoom(
  roomId: string,
  tx: RoomOsDb = db,
): Promise<string | null> {
  const [row] = await tx
    .select({ pgId: floors.pgId })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(rooms.id, roomId))
    .limit(1);
  return row?.pgId ?? null;
}

export async function resolvePgIdForBooking(
  bookingId: string,
  tx: RoomOsDb = db,
): Promise<string | null> {
  const [row] = await tx
    .select({ pgId: floors.pgId })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(bedReservations.bookingId, bookingId))
    .limit(1);
  return row?.pgId ?? null;
}

/** Enqueue rebuild command inside the caller's open transaction. */
export async function enqueuePropertyIndexRebuildFromWriter(
  tx: RoomOsDb,
  input: WriterRebuildInput,
): Promise<void> {
  await appendRoomOsOutboxEntry(
    {
      streamType: 'property',
      streamId: input.pgId,
      eventType: 'property_index.rebuild_requested',
      rulesEffectivePackId: RULES_CATALOG_V1_ID,
      payload: {
        pgId: input.pgId,
        billingMonth: firstOfMonth(input.billingMonth ?? todayString()),
        ...(input.asOf ? { asOf: input.asOf } : {}),
      },
      sourceRef: input.sourceRef,
    },
    tx,
  );
}
