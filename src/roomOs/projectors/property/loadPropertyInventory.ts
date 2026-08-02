/**
 * Property inventory loader — entity ids only (no business logic).
 */

import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, floors, pgs, rooms } from '@/src/db/schema';

export type PropertyInventoryRoom = {
  roomId: string;
  roomNumber: string;
  bedIds: string[];
};

export type PropertyInventory = {
  pgId: string;
  rooms: PropertyInventoryRoom[];
};

export async function propertyExists(pgId: string): Promise<boolean> {
  const [row] = await db.select({ id: pgs.id }).from(pgs).where(eq(pgs.id, pgId)).limit(1);
  return Boolean(row);
}

/** Load room and bed ids for a property — sorted for deterministic projection order. */
export async function loadPropertyInventory(pgId: string): Promise<PropertyInventory> {
  const rows = await db
    .select({
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      bedId: beds.id,
    })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(beds, eq(beds.roomId, rooms.id))
    .where(and(eq(floors.pgId, pgId), isNull(rooms.archivedAt), isNull(beds.archivedAt)))
    .orderBy(asc(rooms.roomNumber), asc(rooms.id), asc(beds.bedCode), asc(beds.id));

  const roomMap = new Map<string, PropertyInventoryRoom>();
  for (const row of rows) {
    const existing = roomMap.get(row.roomId);
    if (existing) {
      existing.bedIds.push(row.bedId);
      continue;
    }
    roomMap.set(row.roomId, {
      roomId: row.roomId,
      roomNumber: row.roomNumber,
      bedIds: [row.bedId],
    });
  }

  return {
    pgId,
    rooms: [...roomMap.values()],
  };
}
