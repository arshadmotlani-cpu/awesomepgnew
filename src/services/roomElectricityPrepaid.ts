import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomElectricityPrepaidLedger, rooms } from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { floors } from '@/src/db/schema/floors';

async function roomPgId(roomId: string): Promise<string | null> {
  const [row] = await db
    .select({ pgId: floors.pgId })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(rooms.id, roomId))
    .limit(1);
  return row?.pgId ?? null;
}

export async function addRoomElectricityPrepaidCredit(
  session: AdminSession,
  input: {
    roomId: string;
    amountPaise: number;
    paidByNote: string;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!Number.isFinite(input.amountPaise) || input.amountPaise <= 0) {
    return { ok: false, message: 'Amount must be greater than zero.' };
  }
  const note = input.paidByNote.trim();
  if (!note) {
    return { ok: false, message: 'Describe who paid (e.g. former tenant name).' };
  }

  const pgId = await roomPgId(input.roomId);
  if (!pgId) return { ok: false, message: 'Room not found.' };
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId)) {
    return { ok: false, message: 'You do not have access to this PG.' };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(rooms)
      .set({
        electricityPrepaidCreditPaise: sql`coalesce(${rooms.electricityPrepaidCreditPaise}, 0) + ${input.amountPaise}`,
        updatedAt: new Date(),
      })
      .where(eq(rooms.id, input.roomId));

    await tx.insert(roomElectricityPrepaidLedger).values({
      roomId: input.roomId,
      entryKind: 'added',
      amountPaise: input.amountPaise,
      paidByNote: note,
      createdByAdminId: session.adminId,
    });
  });

  return { ok: true };
}

export async function getRoomPrepaidCreditBalance(roomId: string): Promise<number> {
  const [row] = await db
    .select({ balance: rooms.electricityPrepaidCreditPaise })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  return row?.balance ?? 0;
}

export async function listRoomPrepaidLedger(roomId: string, limit = 5) {
  return db
    .select()
    .from(roomElectricityPrepaidLedger)
    .where(eq(roomElectricityPrepaidLedger.roomId, roomId))
    .orderBy(desc(roomElectricityPrepaidLedger.createdAt))
    .limit(limit);
}
