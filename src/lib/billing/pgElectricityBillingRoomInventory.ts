/**
 * Authoritative PG room inventory for electricity billing surfaces.
 *
 * Facility type (room_types.has_ac) is metadata only — it must NOT gate inclusion.
 * Per-room/month eligibility (occupants, maintenance, meter baseline) is computed in
 * loadPgElectricityBillingChecklist.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { floors, roomTypes, rooms } from '@/src/db/schema';

export type PgElectricityBillingRoomInventoryRow = {
  roomId: string;
  roomNumber: string;
  hasAc: boolean;
};

/** Non-archived rooms in a PG — full electricity billing inventory (not AC-filtered). */
export async function listPgRoomsForElectricityBillingInventory(
  pgId: string,
): Promise<PgElectricityBillingRoomInventoryRow[]> {
  return db
    .select({
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      hasAc: roomTypes.hasAc,
    })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(and(eq(floors.pgId, pgId), sql`${rooms.archivedAt} IS NULL`))
    .orderBy(rooms.roomNumber);
}

/** SQL fragment: non-archived room eligible for electricity inventory scans (no AC gate). */
export const ELECTRICITY_BILLING_ROOM_INVENTORY_SQL = sql`
  r.archived_at IS NULL
`;
