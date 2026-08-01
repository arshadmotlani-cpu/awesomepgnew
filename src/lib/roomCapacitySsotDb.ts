/**
 * DB-backed room capacity sync — server only.
 */
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, floors, rooms, roomTypes } from '@/src/db/schema';
import {
  resolveRoomTypeNameForCapacity,
  roomCapacityFromActiveBedCount,
} from '@/src/lib/roomCapacitySsot';

export async function countActiveBedsInRoom(
  roomId: string,
  executor: typeof db = db,
): Promise<number> {
  const [{ bedCount }] = await executor
    .select({ bedCount: count() })
    .from(beds)
    .where(and(eq(beds.roomId, roomId), isNull(beds.archivedAt)));
  return bedCount;
}

/**
 * Sync stored room type capacity + generic name after bed add/remove.
 *
 * When only this room uses the room type, update it in place.
 * When the room type is shared, reassign this room to a matching type so
 * other rooms keep their original capacity label.
 */
export async function syncRoomCapacityFromActiveBeds(
  roomId: string,
  executor: typeof db = db,
): Promise<number> {
  const activeBedCount = await countActiveBedsInRoom(roomId, executor);
  const [room] = await executor
    .select({ roomTypeId: rooms.roomTypeId, floorId: rooms.floorId })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!room) return activeBedCount;

  const [floor] = await executor
    .select({ pgId: floors.pgId })
    .from(floors)
    .where(eq(floors.id, room.floorId))
    .limit(1);
  if (!floor) return activeBedCount;

  const [type] = await executor
    .select({ id: roomTypes.id, name: roomTypes.name, hasAc: roomTypes.hasAc })
    .from(roomTypes)
    .where(eq(roomTypes.id, room.roomTypeId))
    .limit(1);
  if (!type) return activeBedCount;

  const capacity = Math.max(1, roomCapacityFromActiveBedCount(activeBedCount));
  const name = resolveRoomTypeNameForCapacity(type.name, activeBedCount);

  const [{ roomCount }] = await executor
    .select({ roomCount: count() })
    .from(rooms)
    .where(and(eq(rooms.roomTypeId, room.roomTypeId), isNull(rooms.archivedAt)));

  if (roomCount === 1) {
    await executor
      .update(roomTypes)
      .set({
        defaultCapacity: capacity,
        name,
        updatedAt: new Date(),
      })
      .where(eq(roomTypes.id, type.id));
    return activeBedCount;
  }

  let [targetType] = await executor
    .select()
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.pgId, floor.pgId),
        eq(roomTypes.name, name),
        eq(roomTypes.defaultCapacity, capacity),
        eq(roomTypes.hasAc, type.hasAc),
      ),
    )
    .limit(1);

  if (!targetType) {
    [targetType] = await executor
      .insert(roomTypes)
      .values({
        pgId: floor.pgId,
        name,
        defaultCapacity: capacity,
        hasAc: type.hasAc,
      })
      .returning();
  }

  await executor
    .update(rooms)
    .set({ roomTypeId: targetType.id, updatedAt: new Date() })
    .where(eq(rooms.id, roomId));

  return activeBedCount;
}
