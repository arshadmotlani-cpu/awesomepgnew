import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { autoBedCodes } from '@/src/lib/roomSharing';
import { db } from '@/src/db/client';
import {
  bedPrices,
  beds,
  floors,
  pgs,
  rooms,
  roomTypes,
} from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';

function assertPgAccess(session: AdminSession, pgId: string) {
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId)) {
    throw new Error('You do not have access to this PG.');
  }
}

export type PgInventoryBedRow = {
  bedId: string;
  bedCode: string;
  bedStatus: string;
  roomId: string;
  roomNumber: string;
  floorLabel: string;
  roomTypeName: string;
  monthlyRatePaise: number;
  dailyRatePaise: number;
};

export async function getPgInventory(session: AdminSession, pgId: string) {
  assertPgAccess(session, pgId);

  const floorRows = await db
    .select({
      id: floors.id,
      floorNumber: floors.floorNumber,
      label: floors.label,
      roomCount: sql<number>`count(distinct ${rooms.id})::int`,
      bedCount: sql<number>`count(distinct ${beds.id})::int`,
    })
    .from(floors)
    .leftJoin(rooms, and(eq(rooms.floorId, floors.id), isNull(rooms.archivedAt)))
    .leftJoin(beds, and(eq(beds.roomId, rooms.id), isNull(beds.archivedAt)))
    .where(and(eq(floors.pgId, pgId), isNull(floors.archivedAt)))
    .groupBy(floors.id)
    .orderBy(asc(floors.floorNumber));

  const bedRows = await db
    .select({
      bedId: beds.id,
      bedCode: beds.bedCode,
      bedStatus: beds.status,
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      floorLabel: sql<string>`coalesce(${floors.label}, 'Floor ' || ${floors.floorNumber})`,
      roomTypeName: roomTypes.name,
      monthlyRatePaise: sql<number>`coalesce((
        SELECT bp.monthly_rate_paise::bigint::int FROM ${bedPrices} bp
        WHERE bp.bed_id = ${beds.id}
          AND bp.effective_from <= CURRENT_DATE
          AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
        ORDER BY bp.effective_from DESC LIMIT 1
      ), 0)`,
      dailyRatePaise: sql<number>`coalesce((
        SELECT bp.daily_rate_paise::bigint::int FROM ${bedPrices} bp
        WHERE bp.bed_id = ${beds.id}
          AND bp.effective_from <= CURRENT_DATE
          AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
        ORDER BY bp.effective_from DESC LIMIT 1
      ), 0)`,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(
      and(
        eq(floors.pgId, pgId),
        isNull(beds.archivedAt),
        isNull(rooms.archivedAt),
        isNull(floors.archivedAt),
      ),
    )
    .orderBy(asc(floors.floorNumber), asc(rooms.roomNumber), asc(beds.bedCode));

  return { floors: floorRows, beds: bedRows as PgInventoryBedRow[] };
}

export type QuickAddRoomBedsInput = {
  floorNumber: number;
  floorLabel?: string;
  roomNumber: string;
  roomTypeName: string;
  sharingCount: number;
  bedsToAdd: number;
  hasAc?: boolean;
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise: number;
  dailyDepositPaise?: number;
  weeklyDepositPaise?: number;
  monthlyDepositPaise?: number;
};

export type QuickAddRoomBedsResult = {
  bedIds: string[];
  bedCodes: string[];
  roomNumber: string;
};

export async function quickAddRoomBeds(
  session: AdminSession,
  pgId: string,
  input: QuickAddRoomBedsInput,
): Promise<QuickAddRoomBedsResult> {
  if (!Number.isInteger(input.bedsToAdd) || input.bedsToAdd < 1 || input.bedsToAdd > 5) {
    throw new Error('Beds to add must be between 1 and 5.');
  }
  if (input.sharingCount < input.bedsToAdd) {
    throw new Error('Cannot add more beds than the sharing type allows.');
  }
  return quickAddBedsInternal(session, pgId, input);
}

/** @deprecated Use quickAddRoomBeds — kept for any legacy callers. */
export type QuickAddBedInput = QuickAddRoomBedsInput & { bedCode?: string; capacity?: number };

export async function quickAddBed(session: AdminSession, pgId: string, input: QuickAddBedInput) {
  const result = await quickAddBedsInternal(session, pgId, {
    floorNumber: input.floorNumber,
    floorLabel: input.floorLabel,
    roomNumber: input.roomNumber,
    roomTypeName: input.roomTypeName,
    sharingCount: input.capacity ?? input.sharingCount ?? 1,
    bedsToAdd: 1,
    hasAc: input.hasAc,
    dailyRatePaise: input.dailyRatePaise,
    weeklyRatePaise: input.weeklyRatePaise,
    monthlyRatePaise: input.monthlyRatePaise,
    dailyDepositPaise: input.dailyDepositPaise,
    weeklyDepositPaise: input.weeklyDepositPaise,
    monthlyDepositPaise: input.monthlyDepositPaise,
  });
  return result.bedIds[0];
}

async function quickAddBedsInternal(
  session: AdminSession,
  pgId: string,
  input: QuickAddRoomBedsInput,
): Promise<QuickAddRoomBedsResult> {
  assertPgAccess(session, pgId);

  const [pg] = await db.select({ id: pgs.id }).from(pgs).where(eq(pgs.id, pgId)).limit(1);
  if (!pg) throw new Error('PG not found.');

  if (input.monthlyRatePaise <= 0 && input.dailyRatePaise <= 0 && input.weeklyRatePaise <= 0) {
    throw new Error('Set at least one rate (daily, weekly, or monthly).');
  }
  if (input.sharingCount < 1 || input.sharingCount > 5) {
    throw new Error('Sharing type must be between 1 and 5.');
  }

  let [floor] = await db
    .select()
    .from(floors)
    .where(
      and(
        eq(floors.pgId, pgId),
        eq(floors.floorNumber, input.floorNumber),
        isNull(floors.archivedAt),
      ),
    )
    .limit(1);

  if (!floor) {
    [floor] = await db
      .insert(floors)
      .values({
        pgId,
        floorNumber: input.floorNumber,
        label: input.floorLabel?.trim() || `Floor ${input.floorNumber}`,
      })
      .returning();
  }

  let [roomType] = await db
    .select()
    .from(roomTypes)
    .where(and(eq(roomTypes.pgId, pgId), eq(roomTypes.name, input.roomTypeName.trim())))
    .limit(1);

  if (!roomType) {
    [roomType] = await db
      .insert(roomTypes)
      .values({
        pgId,
        name: input.roomTypeName.trim(),
        defaultCapacity: input.sharingCount,
        hasAc: input.hasAc ?? false,
      })
      .returning();
  }

  let [room] = await db
    .select()
    .from(rooms)
    .where(
      and(eq(rooms.floorId, floor.id), eq(rooms.roomNumber, input.roomNumber.trim()), isNull(rooms.archivedAt)),
    )
    .limit(1);

  if (!room) {
    [room] = await db
      .insert(rooms)
      .values({
        floorId: floor.id,
        roomTypeId: roomType.id,
        roomNumber: input.roomNumber.trim(),
      })
      .returning();
  }

  const [{ existingCount }] = await db
    .select({ existingCount: count() })
    .from(beds)
    .where(and(eq(beds.roomId, room.id), isNull(beds.archivedAt)));

  const maxBeds = roomType.defaultCapacity;
  const vacant = maxBeds - existingCount;
  if (vacant <= 0) {
    throw new Error(
      `Room ${input.roomNumber.trim()} already has ${existingCount} bed(s) (max ${maxBeds} for ${roomType.name}).`,
    );
  }
  if (input.bedsToAdd > vacant) {
    throw new Error(
      `Only ${vacant} more bed(s) can be added to room ${input.roomNumber.trim()} (${maxBeds} sharing max).`,
    );
  }

  const bedCodes = autoBedCodes(existingCount, input.bedsToAdd);
  const today = new Date().toISOString().slice(0, 10);
  const bedIds: string[] = [];

  for (const bedCode of bedCodes) {
    const [bed] = await db
      .insert(beds)
      .values({
        roomId: room.id,
        bedCode,
        status: 'available',
      })
      .returning();

    const monthlyDep = input.monthlyDepositPaise ?? 0;
    await db.insert(bedPrices).values({
      bedId: bed.id,
      dailyRatePaise: input.dailyRatePaise,
      weeklyRatePaise: input.weeklyRatePaise,
      monthlyRatePaise: input.monthlyRatePaise,
      securityDepositPaise: monthlyDep,
      dailySecurityDepositPaise: input.dailyDepositPaise ?? 0,
      weeklySecurityDepositPaise: input.weeklyDepositPaise ?? 0,
      monthlySecurityDepositPaise: monthlyDep,
      effectiveFrom: today,
    });

    bedIds.push(bed.id);
  }

  return {
    bedIds,
    bedCodes,
    roomNumber: input.roomNumber.trim(),
  };
}
