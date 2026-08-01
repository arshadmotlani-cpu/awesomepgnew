/**
 * Reconcile room inventory metadata with active bed count.
 *
 * Repairs stale room type capacity / sharing labels when beds were archived
 * before sync ran, or when a shared room type prevented in-place updates.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { floors, pgs, rooms } from '@/src/db/schema';
import { scheduleAvailabilityCacheInvalidation } from '@/src/lib/cache/invalidateAvailability';
import { syncRoomCapacityFromActiveBeds } from '@/src/lib/roomCapacitySsotDb';
import { revalidatePricingViews } from '@/src/lib/pricingRevalidate';
import type { RoomIntegrityResult } from '@/src/lib/roomIntegrity/types';
import {
  assertRoomIntegrityOrThrow,
  getAllPgsRoomIntegrityReport,
  validateRoomById,
} from '@/src/services/roomIntegrityValidator';

export type ReconcileRoomResult = {
  roomId: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  before: RoomIntegrityResult | null;
  after: RoomIntegrityResult | null;
  fixed: boolean;
  error?: string;
};

export type ReconcileAllReport = {
  scanned: number;
  mismatched: number;
  fixed: number;
  stillBroken: number;
  results: ReconcileRoomResult[];
};

async function revalidateRoomCaches(roomId: string): Promise<void> {
  const [row] = await db
    .select({ pgId: floors.pgId, pgSlug: pgs.slug })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (!row) return;

  revalidatePricingViews(row.pgSlug ?? undefined, { pgId: row.pgId });
  scheduleAvailabilityCacheInvalidation({ roomId, pgId: row.pgId, pgSlug: row.pgSlug });
}

/** Sync room type metadata from active beds and verify integrity. */
export async function reconcileRoomInventoryFromBeds(roomId: string): Promise<ReconcileRoomResult> {
  const before = await validateRoomById(roomId);
  if (!before) {
    return {
      roomId,
      pgId: '',
      pgName: '',
      roomNumber: '',
      before: null,
      after: null,
      fixed: false,
      error: 'Room not found.',
    };
  }

  try {
    await syncRoomCapacityFromActiveBeds(roomId);

    if (before.physicalBeds > 0) {
      await assertRoomIntegrityOrThrow(roomId);
    }

    const after = await validateRoomById(roomId);
    const fixed = Boolean(before.hasMismatch && after && !after.hasMismatch);

    if (fixed) {
      await revalidateRoomCaches(roomId);
    }

    return {
      roomId,
      pgId: before.pgId,
      pgName: before.pgName,
      roomNumber: before.roomNumber,
      before,
      after,
      fixed,
    };
  } catch (err) {
    const after = await validateRoomById(roomId);
    return {
      roomId,
      pgId: before.pgId,
      pgName: before.pgName,
      roomNumber: before.roomNumber,
      before,
      after,
      fixed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Repair every room that currently fails integrity checks. */
export async function reconcileAllMismatchedRooms(): Promise<ReconcileAllReport> {
  const audit = await getAllPgsRoomIntegrityReport();
  const mismatched = audit.reports.flatMap((pg) => pg.rooms.filter((r) => r.hasMismatch));

  const results: ReconcileRoomResult[] = [];
  for (const room of mismatched) {
    results.push(await reconcileRoomInventoryFromBeds(room.roomId));
  }

  const fixed = results.filter((r) => r.fixed).length;
  const stillBroken = results.filter((r) => r.after?.hasMismatch).length;

  return {
    scanned: audit.totalRooms,
    mismatched: mismatched.length,
    fixed,
    stillBroken,
    results,
  };
}
