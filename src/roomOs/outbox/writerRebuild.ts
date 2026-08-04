/**
 * Ledger writers → Room OS outbox — enqueue property_index.rebuild_requested in-process.
 * Writers import this module only (not projectors).
 *
 * Payment settlement is primary. Outbox enqueue is best-effort only and must never
 * abort the caller's open transaction (Room OS may be dormant / table absent).
 */

import { eq, sql } from 'drizzle-orm';
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

/** Cached per-process: production may not have Room OS migrations yet. */
let outboxTablePresent: boolean | null = null;

/** Test-only: reset presence cache between cases. */
export function resetRoomOsOutboxPresenceCacheForTests(): void {
  outboxTablePresent = null;
}

async function isRoomOsOutboxPresent(tx: RoomOsDb): Promise<boolean> {
  if (outboxTablePresent != null) return outboxTablePresent;
  const rows = await tx.execute<{ present: boolean }>(sql`
    SELECT to_regclass('public.room_os_outbox') IS NOT NULL AS present
  `);
  const row = Array.isArray(rows) ? rows[0] : (rows as { rows?: Array<{ present: boolean }> })?.rows?.[0];
  outboxTablePresent = Boolean(row && (row as { present: boolean }).present);
  return outboxTablePresent;
}

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

/**
 * Enqueue rebuild command inside the caller's open transaction.
 *
 * Best-effort only:
 * - Skips when `room_os_outbox` is absent (Room OS dormant / migrations not applied).
 * - Uses SAVEPOINT around insert so any outbox failure cannot abort settlement.
 * - Does NOT call resolveEffectivePackId — nested global-pool query deadlocks inside TX.
 */
export async function enqueuePropertyIndexRebuildFromWriter(
  tx: RoomOsDb,
  input: WriterRebuildInput,
): Promise<void> {
  if (!(await isRoomOsOutboxPresent(tx))) {
    console.warn('[room-os] outbox enqueue skipped — room_os_outbox missing', {
      sourceRef: input.sourceRef,
      pgId: input.pgId,
    });
    return;
  }

  const sp = `room_os_outbox_${Math.random().toString(36).slice(2, 10)}`;
  await tx.execute(sql.raw(`SAVEPOINT ${sp}`));
  try {
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
    await tx.execute(sql.raw(`RELEASE SAVEPOINT ${sp}`));
  } catch (err) {
    try {
      await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${sp}`));
    } catch (rollbackErr) {
      console.error(
        '[room-os] outbox SAVEPOINT rollback failed',
        rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
      );
    }
    console.error(
      '[room-os] outbox enqueue skipped (settlement continues)',
      err instanceof Error ? err.message : String(err),
      { sourceRef: input.sourceRef, pgId: input.pgId },
    );
  }
}
