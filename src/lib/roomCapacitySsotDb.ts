/**
 * DB-backed room capacity sync — server only.
 */
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, rooms, roomTypes } from '@/src/db/schema';
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

/** Sync stored room type capacity + generic name after bed add/remove. */
export async function syncRoomCapacityFromActiveBeds(
  roomId: string,
  executor: typeof db = db,
): Promise<number> {
  const activeBedCount = await countActiveBedsInRoom(roomId, executor);
  const [room] = await executor
    .select({ roomTypeId: rooms.roomTypeId })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!room) return activeBedCount;

  const [type] = await executor
    .select({ id: roomTypes.id, name: roomTypes.name })
    .from(roomTypes)
    .where(eq(roomTypes.id, room.roomTypeId))
    .limit(1);
  if (!type) return activeBedCount;

  const capacity = Math.max(1, roomCapacityFromActiveBedCount(activeBedCount));
  const name = resolveRoomTypeNameForCapacity(type.name, activeBedCount);

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
