/**
 * Room Brain stack initialization — UUID-scoped, never room number.
 * Called when admin creates a new room so all brains are ready without manual setup.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { rooms } from '@/src/db/schema';

export type RoomBrainStackInitResult = {
  roomId: string;
  initialized: true;
  brains: Array<
    'room' | 'electricity' | 'resident' | 'deposit' | 'billing' | 'exit'
  >;
};

/**
 * Ensures a room is ready for all brain read models.
 * Brains compose on demand from internal roomId — this hook is the certification anchor.
 */
export async function initializeRoomBrainStack(roomId: string): Promise<RoomBrainStackInitResult> {
  const [room] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new Error(`initializeRoomBrainStack: room ${roomId} not found`);
  }

  return {
    roomId: room.id,
    initialized: true,
    brains: ['room', 'electricity', 'resident', 'deposit', 'billing', 'exit'],
  };
}
