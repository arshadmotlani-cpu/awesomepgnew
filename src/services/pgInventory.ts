import { and, asc, count, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { autoBedCodes } from '@/src/lib/roomSharing';
import { db } from '@/src/db/client';
import {
  bedPrices,
  bedReservations,
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
  floorNumber: number;
  floorLabel: string;
  roomTypeName: string;
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise: number;
  dailyDepositPaise: number;
  weeklyDepositPaise: number;
  monthlyDepositPaise: number;
};

export type BedPricingInput = {
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise: number;
  dailyDepositPaise: number;
  weeklyDepositPaise: number;
  monthlyDepositPaise: number;
};

function activeBedPricePaise(
  columnName:
    | 'daily_rate_paise'
    | 'weekly_rate_paise'
    | 'monthly_rate_paise'
    | 'daily_security_deposit_paise'
    | 'weekly_security_deposit_paise'
    | 'monthly_security_deposit_paise',
) {
  return sql<number>`coalesce((
    SELECT bp.${sql.raw(columnName)}::bigint::int FROM ${bedPrices} bp
    WHERE bp.bed_id = ${beds.id}
      AND bp.effective_from <= CURRENT_DATE
      AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
    ORDER BY bp.effective_from DESC LIMIT 1
  ), 0)`;
}

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
      floorNumber: floors.floorNumber,
      floorLabel: sql<string>`coalesce(${floors.label}, 'Floor ' || ${floors.floorNumber})`,
      roomTypeName: roomTypes.name,
      dailyRatePaise: activeBedPricePaise('daily_rate_paise'),
      weeklyRatePaise: activeBedPricePaise('weekly_rate_paise'),
      monthlyRatePaise: activeBedPricePaise('monthly_rate_paise'),
      dailyDepositPaise: activeBedPricePaise('daily_security_deposit_paise'),
      weeklyDepositPaise: activeBedPricePaise('weekly_security_deposit_paise'),
      monthlyDepositPaise: activeBedPricePaise('monthly_security_deposit_paise'),
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

/**
 * Apply the same rent + deposit to every bed in a room. Creates a new
 * `bed_prices` row (or updates today's row) per bed — rooms of the same
 * sharing type can keep different prices.
 */
export async function updateRoomBedPricing(
  session: AdminSession,
  pgId: string,
  roomId: string,
  input: BedPricingInput,
): Promise<void> {
  assertPgAccess(session, pgId);

  if (
    input.monthlyRatePaise <= 0 &&
    input.dailyRatePaise <= 0 &&
    input.weeklyRatePaise <= 0
  ) {
    throw new Error('Set at least one rate (daily, weekly, or monthly).');
  }

  const roomBeds = await db
    .select({ bedId: beds.id })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(beds.roomId, roomId),
        eq(floors.pgId, pgId),
        isNull(beds.archivedAt),
        isNull(rooms.archivedAt),
        isNull(floors.archivedAt),
      ),
    );

  if (roomBeds.length === 0) {
    throw new Error('No beds in this room.');
  }

  const today = new Date().toISOString().slice(0, 10);
  const monthlyDep = input.monthlyDepositPaise;
  const priceValues = {
    dailyRatePaise: input.dailyRatePaise,
    weeklyRatePaise: input.weeklyRatePaise,
    monthlyRatePaise: input.monthlyRatePaise,
    securityDepositPaise: monthlyDep,
    dailySecurityDepositPaise: input.dailyDepositPaise,
    weeklySecurityDepositPaise: input.weeklyDepositPaise,
    monthlySecurityDepositPaise: monthlyDep,
  };

  for (const { bedId } of roomBeds) {
    const [active] = await db
      .select()
      .from(bedPrices)
      .where(
        and(
          eq(bedPrices.bedId, bedId),
          sql`${bedPrices.effectiveFrom} <= ${today}::date`,
          or(
            isNull(bedPrices.effectiveTo),
            sql`${bedPrices.effectiveTo} > ${today}::date`,
          ),
        ),
      )
      .orderBy(desc(bedPrices.effectiveFrom))
      .limit(1);

    if (active?.effectiveFrom === today) {
      await db
        .update(bedPrices)
        .set({ ...priceValues, updatedAt: new Date() })
        .where(eq(bedPrices.id, active.id));
    } else if (active) {
      await db
        .update(bedPrices)
        .set({ effectiveTo: today, updatedAt: new Date() })
        .where(eq(bedPrices.id, active.id));
      await db.insert(bedPrices).values({
        bedId,
        ...priceValues,
        effectiveFrom: today,
      });
    } else {
      await db.insert(bedPrices).values({
        bedId,
        ...priceValues,
        effectiveFrom: today,
      });
    }
  }
}

export type UpdateRoomDetailsInput = {
  floorNumber: number;
  floorLabel?: string;
  roomNumber: string;
};

/** Move a room to another floor and/or change its room number. */
export async function updateRoomDetails(
  session: AdminSession,
  pgId: string,
  roomId: string,
  input: UpdateRoomDetailsInput,
): Promise<void> {
  assertPgAccess(session, pgId);

  if (!Number.isInteger(input.floorNumber)) {
    throw new Error('Enter a valid floor number.');
  }

  const roomNumber = input.roomNumber.trim();
  if (!roomNumber) {
    throw new Error('Room number is required.');
  }

  const [roomRow] = await db
    .select({
      roomId: rooms.id,
      pgId: floors.pgId,
    })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(eq(rooms.id, roomId), isNull(rooms.archivedAt), isNull(floors.archivedAt)),
    )
    .limit(1);

  if (!roomRow || roomRow.pgId !== pgId) {
    throw new Error('Room not found.');
  }

  let [targetFloor] = await db
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

  if (!targetFloor) {
    [targetFloor] = await db
      .insert(floors)
      .values({
        pgId,
        floorNumber: input.floorNumber,
        label: input.floorLabel?.trim() || `Floor ${input.floorNumber}`,
      })
      .returning();
  } else if (input.floorLabel?.trim()) {
    await db
      .update(floors)
      .set({ label: input.floorLabel.trim(), updatedAt: new Date() })
      .where(eq(floors.id, targetFloor.id));
  }

  const [conflict] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(
      and(
        eq(rooms.floorId, targetFloor.id),
        eq(rooms.roomNumber, roomNumber),
        isNull(rooms.archivedAt),
        sql`${rooms.id} <> ${roomId}`,
      ),
    )
    .limit(1);

  if (conflict) {
    throw new Error(`Room ${roomNumber} already exists on this floor.`);
  }

  await db
    .update(rooms)
    .set({
      floorId: targetFloor.id,
      roomNumber,
      updatedAt: new Date(),
    })
    .where(eq(rooms.id, roomId));
}

async function bedHasActiveReservation(bedId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bedReservations.id })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bedId, bedId),
        sql`${bedReservations.status} IN ('hold', 'active')`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function assertBedInPg(pgId: string, bedId: string) {
  const [row] = await db
    .select({ bedId: beds.id })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(beds.id, bedId),
        eq(floors.pgId, pgId),
        isNull(beds.archivedAt),
        isNull(rooms.archivedAt),
        isNull(floors.archivedAt),
      ),
    )
    .limit(1);
  if (!row) throw new Error('Bed not found.');
}

async function assertRoomInPg(pgId: string, roomId: string) {
  const [row] = await db
    .select({ roomId: rooms.id })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(rooms.id, roomId),
        eq(floors.pgId, pgId),
        isNull(rooms.archivedAt),
        isNull(floors.archivedAt),
      ),
    )
    .limit(1);
  if (!row) throw new Error('Room not found.');
}

/** Soft-delete a bed (hidden from listings; booking history kept). */
export async function archiveBed(
  session: AdminSession,
  pgId: string,
  bedId: string,
): Promise<void> {
  assertPgAccess(session, pgId);
  await assertBedInPg(pgId, bedId);

  if (await bedHasActiveReservation(bedId)) {
    throw new Error('Cannot remove this bed — it has an active booking or hold.');
  }

  await db
    .update(beds)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(beds.id, bedId));
}

/** Soft-delete a room and all its beds. */
export async function archiveRoom(
  session: AdminSession,
  pgId: string,
  roomId: string,
): Promise<void> {
  assertPgAccess(session, pgId);
  await assertRoomInPg(pgId, roomId);

  const roomBeds = await db
    .select({ bedId: beds.id })
    .from(beds)
    .where(and(eq(beds.roomId, roomId), isNull(beds.archivedAt)));

  for (const { bedId } of roomBeds) {
    if (await bedHasActiveReservation(bedId)) {
      throw new Error(
        'Cannot remove this room — one or more beds have an active booking or hold.',
      );
    }
  }

  const now = new Date();
  if (roomBeds.length > 0) {
    await db
      .update(beds)
      .set({ archivedAt: now, updatedAt: now })
      .where(and(eq(beds.roomId, roomId), isNull(beds.archivedAt)));
  }

  await db
    .update(rooms)
    .set({ archivedAt: now, updatedAt: now })
    .where(eq(rooms.id, roomId));
}
