import { and, asc, count, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { autoBedCodes, nextBedCodesForRoom, sharingTypeName, wizardBedCodes, MAX_ROOM_BEDS } from '@/src/lib/roomSharing';
import {
  countActiveBedsInRoom,
  syncRoomCapacityFromActiveBeds,
} from '@/src/lib/roomCapacitySsotDb';
import {
  resolveRoomTypeNameForCapacity,
  roomCapacityFromActiveBedCount,
} from '@/src/lib/roomCapacitySsot';
import { formatDate, parseDate, todayString } from '@/src/lib/dates';
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
import { hasBedActiveOrHoldReservation, assertBedCanBeArchived } from '@/src/lib/bedOccupancyCheck';
import {
  assertBedAdditionAllowed,
  assertBedRemovalAllowed,
  assertCapacityReductionAllowed,
} from '@/src/lib/roomIntegrity/proposedChanges';
import { assertRoomTypeNameMatchesBedCount } from '@/src/lib/roomIntegrity/validateRoomIntegrity';
import { monthStartFor, writeBedPriceVersion } from '@/src/services/pgInventoryPricing';
import {
  assertRoomIntegrityOrThrow,
  validateRoomById,
} from '@/src/services/roomIntegrityValidator';

export type PgPricingRateTier = 'daily' | 'weekly' | 'monthly';

export type PgPricingAdjustmentSummary = {
  pgName: string;
  roomsAffected: number;
  bedsAffected: number;
  roomNumbers: string[];
  previousAvgMonthlyPaise: number;
  newAvgMonthlyPaise: number;
};

function adjustPaise(current: number, mode: 'percent' | 'fixed', value: number): number {
  if (current <= 0 && mode === 'percent') return 0;
  if (mode === 'percent') {
    return Math.max(0, Math.round(current * (1 + value / 100)));
  }
  return Math.max(0, current + value);
}

function buildAdjustedBedPriceVersion(
  bed: PgInventoryBedRow,
  tiers: PgPricingRateTier[],
  mode: 'percent' | 'fixed',
  value: number,
) {
  let daily = bed.dailyRatePaise;
  let weekly = bed.weeklyRatePaise;
  let monthly = bed.monthlyRatePaise;

  if (tiers.includes('daily')) daily = adjustPaise(daily, mode, value);
  if (tiers.includes('weekly')) weekly = adjustPaise(weekly, mode, value);
  if (tiers.includes('monthly')) monthly = adjustPaise(monthly, mode, value);

  const monthlyDeposit =
    monthly > 0 ? monthly : bed.monthlyDepositPaise;

  return {
    bedId: bed.bedId,
    dailyRatePaise: daily,
    weeklyRatePaise: weekly,
    monthlyRatePaise: monthly,
    dailySecurityDepositPaise: bed.dailyDepositPaise,
    weeklySecurityDepositPaise: bed.weeklyDepositPaise,
    monthlySecurityDepositPaise: monthlyDeposit,
    securityDepositPaise: monthlyDeposit,
  };
}

function averageMonthlyPaise(beds: PgInventoryBedRow[]): number {
  const monthlies = beds.map((b) => b.monthlyRatePaise).filter((m) => m > 0);
  if (monthlies.length === 0) return 0;
  return Math.round(monthlies.reduce((sum, m) => sum + m, 0) / monthlies.length);
}

/**
 * Apply a percent or fixed adjustment to each bed in a PG (or one room).
 * Each bed keeps its own base rates — only the chosen tiers are adjusted.
 * Future bookings use new prices; existing residents keep pricing_snapshot.
 */
export async function applyPgPricingAdjustment(
  session: AdminSession,
  input: {
    pgId: string;
    roomId?: string | null;
    tiers: PgPricingRateTier[];
    mode: 'percent' | 'fixed';
    value: number;
  },
): Promise<PgPricingAdjustmentSummary> {
  assertPgAccess(session, input.pgId);

  const inv = await getPgInventory(session, input.pgId);
  const beds = input.roomId
    ? inv.beds.filter((b) => b.roomId === input.roomId)
    : inv.beds;

  if (beds.length === 0) {
    throw new Error(input.roomId ? 'No beds in this room.' : 'No beds in this PG.');
  }

  const [pgRow] = await db.select({ name: pgs.name, slug: pgs.slug }).from(pgs).where(eq(pgs.id, input.pgId)).limit(1);
  const previousAvgMonthlyPaise = averageMonthlyPaise(beds);

  const monthStart = monthStartFor(todayString());
  const adjustedMonthlies: number[] = [];

  for (const bed of beds) {
    const version = buildAdjustedBedPriceVersion(bed, input.tiers, input.mode, input.value);
    await writeBedPriceVersion(version, monthStart);
    if (version.monthlyRatePaise > 0) {
      adjustedMonthlies.push(version.monthlyRatePaise);
    }
  }

  const newAvgMonthlyPaise =
    adjustedMonthlies.length > 0
      ? Math.round(adjustedMonthlies.reduce((sum, m) => sum + m, 0) / adjustedMonthlies.length)
      : 0;

  const { revalidatePricingViews } = await import('@/src/lib/pricingRevalidate');
  revalidatePricingViews(pgRow?.slug);

  const roomNumbers = [...new Set(beds.map((b) => b.roomNumber))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  return {
    pgName: pgRow?.name ?? 'PG',
    roomsAffected: roomNumbers.length,
    bedsAffected: beds.length,
    roomNumbers,
    previousAvgMonthlyPaise,
    newAvgMonthlyPaise,
  };
}

export type PgDepositPolicySummary = {
  pgName: string;
  pgSlug: string;
  roomsUpdated: number;
  bedsUpdated: number;
  roomNumbers: string[];
  previousPolicyLabel: string;
  newPolicyLabel: string;
  activeBookingCount: number;
  bookingRecordsModified: number;
};

/**
 * Set every bed's deposit to exactly one month's rent. Monthly rent is unchanged.
 * Future bookings use new bed_prices; existing residents keep pricing_snapshot.
 */
export async function applyPgOneMonthDepositPolicy(
  session: AdminSession,
  pgId: string,
): Promise<PgDepositPolicySummary> {
  assertPgAccess(session, pgId);

  const inv = await getPgInventory(session, pgId);
  if (inv.beds.length === 0) {
    throw new Error('No beds in this PG.');
  }

  const [pgRow] = await db
    .select({ name: pgs.name, slug: pgs.slug, amenities: pgs.amenities })
    .from(pgs)
    .where(eq(pgs.id, pgId))
    .limit(1);

  const monthStart = monthStartFor(todayString());
  const roomNumbers = new Set<string>();

  for (const bed of inv.beds) {
    if (bed.monthlyRatePaise <= 0) {
      throw new Error(
        `Bed ${bed.roomNumber}-${bed.bedCode} has no monthly rent — set rent before changing deposit policy.`,
      );
    }

    const oneMonthDeposit = bed.monthlyRatePaise;
    await writeBedPriceVersion(
      {
        bedId: bed.bedId,
        dailyRatePaise: bed.dailyRatePaise,
        weeklyRatePaise: bed.weeklyRatePaise,
        monthlyRatePaise: bed.monthlyRatePaise,
        dailySecurityDepositPaise: bed.dailyDepositPaise,
        weeklySecurityDepositPaise: bed.weeklyDepositPaise,
        monthlySecurityDepositPaise: oneMonthDeposit,
        securityDepositPaise: oneMonthDeposit,
      },
      monthStart,
    );
    roomNumbers.add(bed.roomNumber);
  }

  await db
    .update(pgs)
    .set({
      amenities: {
        ...(pgRow?.amenities ?? {}),
        monthlyDepositPolicy: 'one_month_rent',
      },
      updatedAt: new Date(),
    })
    .where(eq(pgs.id, pgId));

  const { revalidatePricingViews } = await import('@/src/lib/pricingRevalidate');
  revalidatePricingViews(pgRow?.slug);

  const [{ activeBookingCount }] = await db
    .select({ activeBookingCount: count() })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(floors.pgId, pgId),
        eq(bedReservations.status, 'active'),
        sql`${bedReservations.stayRange} @> CURRENT_DATE`,
      ),
    );

  return {
    pgName: pgRow?.name ?? 'PG',
    pgSlug: pgRow?.slug ?? '',
    roomsUpdated: roomNumbers.size,
    bedsUpdated: inv.beds.length,
    roomNumbers: [...roomNumbers].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    previousPolicyLabel: '2 months',
    newPolicyLabel: '1 month',
    activeBookingCount: Number(activeBookingCount),
    bookingRecordsModified: 0,
  };
}

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
  roomTypeId: string;
  roomTypeName: string;
  sharingCount: number;
  hasAc: boolean;
  roomNotes: string | null;
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
      roomTypeId: roomTypes.id,
      roomTypeName: roomTypes.name,
      sharingCount: roomTypes.defaultCapacity,
      hasAc: roomTypes.hasAc,
      roomNotes: rooms.notes,
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

  const bedCountByRoom = new Map<string, number>();
  for (const bed of bedRows) {
    bedCountByRoom.set(bed.roomId, (bedCountByRoom.get(bed.roomId) ?? 0) + 1);
  }

  const normalizedBeds = bedRows.map((bed) => {
    const activeBedCount = bedCountByRoom.get(bed.roomId) ?? 0;
    const sharingCount = roomCapacityFromActiveBedCount(activeBedCount);
    return {
      ...bed,
      sharingCount,
      roomTypeName: resolveRoomTypeNameForCapacity(bed.roomTypeName, activeBedCount),
    };
  });

  return { floors: floorRows, beds: normalizedBeds as PgInventoryBedRow[] };
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
  if (!Number.isInteger(input.bedsToAdd) || input.bedsToAdd < 1 || input.bedsToAdd > MAX_ROOM_BEDS) {
    throw new Error(`Beds to add must be between 1 and ${MAX_ROOM_BEDS}.`);
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
  if (input.sharingCount < 1 || input.sharingCount > MAX_ROOM_BEDS) {
    throw new Error(`Sharing type must be between 1 and ${MAX_ROOM_BEDS}.`);
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

    const { initializeRoomBrainStack } = await import('@/src/lib/brains/initializeRoomBrainStack');
    await initializeRoomBrainStack(room.id);
  }

  const [{ existingCount }] = await db
    .select({ existingCount: count() })
    .from(beds)
    .where(and(eq(beds.roomId, room.id), isNull(beds.archivedAt)));

  const isNewRoom = existingCount === 0;
  assertBedAdditionAllowed({
    currentPhysicalBeds: existingCount,
    bedsToAdd: input.bedsToAdd,
    sharingCount: input.sharingCount,
    isNewRoom,
  });
  if (isNewRoom) {
    assertRoomTypeNameMatchesBedCount(input.roomTypeName.trim(), input.bedsToAdd);
  }

  const existingCodes = isNewRoom
    ? []
    : (
        await db
          .select({ bedCode: beds.bedCode })
          .from(beds)
          .where(and(eq(beds.roomId, room.id), isNull(beds.archivedAt)))
      ).map((b) => b.bedCode);

  const bedCodes = isNewRoom
    ? wizardBedCodes(0, input.bedsToAdd)
    : nextBedCodesForRoom(existingCodes, input.bedsToAdd);
  const monthStart = monthStartFor(todayString());
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
      effectiveFrom: monthStart,
    });

    bedIds.push(bed.id);
  }

  await syncRoomCapacityFromActiveBeds(room.id);
  await assertRoomIntegrityOrThrow(room.id);

  return {
    bedIds,
    bedCodes,
    roomNumber: input.roomNumber.trim(),
  };
}

/**
 * Apply the same rent + deposit to every bed in a room. Creates a new
 * `bed_prices` row (or updates this month's row) per bed — rooms of the same
 * sharing type can keep different prices. Effective from is the 1st of the
 * current month so admin move-in dates like the 1st match saved room rent.
 */
export async function updateRoomBedPricing(
  session: AdminSession,
  pgId: string,
  roomId: string,
  input: BedPricingInput,
  opts?: { affectExistingTenants?: boolean },
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

  const today = todayString();
  const monthStart = monthStartFor(today);
  const monthlyDep = input.monthlyDepositPaise;

  for (const { bedId } of roomBeds) {
    await writeBedPriceVersion(
      {
        bedId,
        dailyRatePaise: input.dailyRatePaise,
        weeklyRatePaise: input.weeklyRatePaise,
        monthlyRatePaise: input.monthlyRatePaise,
        securityDepositPaise: monthlyDep,
        dailySecurityDepositPaise: input.dailyDepositPaise,
        weeklySecurityDepositPaise: input.weeklyDepositPaise,
        monthlySecurityDepositPaise: monthlyDep,
      },
      monthStart,
    );
  }

  const bedIdList = roomBeds.map((b) => b.bedId);
  const { revalidatePricingViews } = await import('@/src/lib/pricingRevalidate');
  const [pgRow] = await db.select({ slug: pgs.slug }).from(pgs).where(eq(pgs.id, pgId)).limit(1);

  if (opts?.affectExistingTenants === true) {
    const { propagatePricingChangeForBeds } = await import('@/src/services/pricingPropagation');
    await propagatePricingChangeForBeds(session, pgId, bedIdList, { notifyResident: false });
  }

  revalidatePricingViews(pgRow?.slug);
}

export type UpdateRoomDetailsInput = {
  floorNumber: number;
  floorLabel?: string;
  roomNumber: string;
  /** Display label on listings, e.g. "Tuition room" or "2 Sharing". */
  roomTypeName?: string;
  sharingCount?: number;
  hasAc?: boolean;
  notes?: string;
};

async function assignRoomTypeForRoom(
  pgId: string,
  roomId: string,
  currentRoomTypeId: string,
  input: { roomTypeName: string; sharingCount: number; hasAc: boolean },
): Promise<string> {
  const activeBedCount = await countActiveBedsInRoom(roomId);
  const effectiveSharing = roomCapacityFromActiveBedCount(activeBedCount);
  const typeName =
    input.roomTypeName.trim() || sharingTypeName(Math.max(1, effectiveSharing));

  if (effectiveSharing > MAX_ROOM_BEDS) {
    throw new Error(`Sharing type must be between 1 and ${MAX_ROOM_BEDS}.`);
  }

  const [{ roomCount }] = await db
    .select({ roomCount: count() })
    .from(rooms)
    .where(and(eq(rooms.roomTypeId, currentRoomTypeId), isNull(rooms.archivedAt)));

  if (roomCount === 1) {
    const capacity = Math.max(1, effectiveSharing);
    await db
      .update(roomTypes)
      .set({
        name: typeName,
        defaultCapacity: capacity,
        hasAc: input.hasAc,
        updatedAt: new Date(),
      })
      .where(eq(roomTypes.id, currentRoomTypeId));
    return currentRoomTypeId;
  }

  const capacity = Math.max(1, effectiveSharing);
  let [targetType] = await db
    .select()
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.pgId, pgId),
        eq(roomTypes.name, typeName),
        eq(roomTypes.defaultCapacity, capacity),
        eq(roomTypes.hasAc, input.hasAc),
      ),
    )
    .limit(1);

  if (!targetType) {
    [targetType] = await db
      .insert(roomTypes)
      .values({
        pgId,
        name: typeName,
        defaultCapacity: capacity,
        hasAc: input.hasAc,
      })
      .returning();
  }

  await db
    .update(rooms)
    .set({ roomTypeId: targetType.id, updatedAt: new Date() })
    .where(eq(rooms.id, roomId));

  return targetType.id;
}

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
      roomTypeId: rooms.roomTypeId,
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
      notes: input.notes?.trim() ? input.notes.trim() : null,
      updatedAt: new Date(),
    })
    .where(eq(rooms.id, roomId));

  if (
    input.roomTypeName !== undefined ||
    input.sharingCount !== undefined ||
    input.hasAc !== undefined
  ) {
    const [currentType] = await db
      .select({
        id: roomTypes.id,
        name: roomTypes.name,
        defaultCapacity: roomTypes.defaultCapacity,
        hasAc: roomTypes.hasAc,
      })
      .from(roomTypes)
      .where(eq(roomTypes.id, roomRow.roomTypeId))
      .limit(1);

    if (!currentType) {
      throw new Error('Room type not found.');
    }

    const activeBedCount = await countActiveBedsInRoom(roomId);
    const effectiveSharing = Math.max(1, roomCapacityFromActiveBedCount(activeBedCount));

    if (input.roomTypeName !== undefined) {
      assertRoomTypeNameMatchesBedCount(input.roomTypeName, activeBedCount);
    }

    await assignRoomTypeForRoom(pgId, roomId, roomRow.roomTypeId, {
      roomTypeName: input.roomTypeName ?? currentType.name,
      sharingCount: effectiveSharing,
      hasAc: input.hasAc ?? currentType.hasAc,
    });
  }
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

  const [bedRow] = await db
    .select({ roomId: beds.roomId, status: beds.status })
    .from(beds)
    .where(eq(beds.id, bedId))
    .limit(1);

  await assertBedCanBeArchived(bedId);

  if (bedRow?.roomId) {
    const roomIntegrity = await validateRoomById(bedRow.roomId);
    if (roomIntegrity) {
      assertBedRemovalAllowed(roomIntegrity, bedRow.status);
    }
  }

  await db
    .update(beds)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(beds.id, bedId));

  if (bedRow?.roomId) {
    await syncRoomCapacityFromActiveBeds(bedRow.roomId);
    const afterRemoval = await validateRoomById(bedRow.roomId);
    if (afterRemoval && afterRemoval.physicalBeds > 0) {
      await assertRoomIntegrityOrThrow(bedRow.roomId);
    }
    const { scheduleAvailabilityCacheInvalidation } = await import(
      '@/src/lib/cache/invalidateAvailability'
    );
    const { revalidatePricingViews } = await import('@/src/lib/pricingRevalidate');
    const [pgRow] = await db
      .select({ pgId: floors.pgId, pgSlug: pgs.slug })
      .from(rooms)
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(eq(rooms.id, bedRow.roomId))
      .limit(1);
    if (pgRow) {
      revalidatePricingViews(pgRow.pgSlug ?? undefined, { pgId: pgRow.pgId });
      scheduleAvailabilityCacheInvalidation({
        roomId: bedRow.roomId,
        pgId: pgRow.pgId,
        pgSlug: pgRow.pgSlug,
      });
    }
  }
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
    if (await hasBedActiveOrHoldReservation(bedId)) {
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

export type ConfigureRoomInput = {
  floorNumber: number;
  floorLabel?: string;
  roomNumber: string;
  roomTypeName: string;
  bedCount: number;
  hasAc?: boolean;
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise: number;
  dailyDepositPaise?: number;
  weeklyDepositPaise?: number;
  monthlyDepositPaise?: number;
};

/** Guided room setup — creates room with exact bed count from preset. */
export async function configureRoomFromPreset(
  session: AdminSession,
  pgId: string,
  input: ConfigureRoomInput,
): Promise<QuickAddRoomBedsResult> {
  assertPgAccess(session, pgId);

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

  if (floor) {
    const [existingRoom] = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(
        and(
          eq(rooms.floorId, floor.id),
          eq(rooms.roomNumber, input.roomNumber.trim()),
          isNull(rooms.archivedAt),
        ),
      )
      .limit(1);

    if (existingRoom) {
      const existingBeds = await countActiveBedsInRoom(existingRoom.id);
      if (existingBeds > 0) {
        throw new Error(
          `Room ${input.roomNumber} already exists. Open Configure room to edit it instead.`,
        );
      }
    }
  }

  return quickAddRoomBeds(session, pgId, {
    floorNumber: input.floorNumber,
    floorLabel: input.floorLabel,
    roomNumber: input.roomNumber,
    roomTypeName: input.roomTypeName,
    sharingCount: input.bedCount,
    bedsToAdd: input.bedCount,
    hasAc: input.hasAc,
    dailyRatePaise: input.dailyRatePaise,
    weeklyRatePaise: input.weeklyRatePaise,
    monthlyRatePaise: input.monthlyRatePaise,
    dailyDepositPaise: input.dailyDepositPaise,
    weeklyDepositPaise: input.weeklyDepositPaise,
    monthlyDepositPaise: input.monthlyDepositPaise,
  });
}

export type ResizeRoomCapacityInput = {
  targetBedCount: number;
  roomTypeName: string;
  hasAc?: boolean;
  pricing?: BedPricingInput;
};

/** Add or remove beds to match a new room type — never silent; throws if blocked. */
export async function resizeRoomCapacity(
  session: AdminSession,
  pgId: string,
  roomId: string,
  input: ResizeRoomCapacityInput,
): Promise<void> {
  assertPgAccess(session, pgId);
  await assertRoomInPg(pgId, roomId);

  if (!Number.isInteger(input.targetBedCount) || input.targetBedCount < 1 || input.targetBedCount > MAX_ROOM_BEDS) {
    throw new Error(`Room capacity must be between 1 and ${MAX_ROOM_BEDS} beds.`);
  }

  const roomIntegrity = await validateRoomById(roomId);
  if (!roomIntegrity) throw new Error('Room not found.');

  assertCapacityReductionAllowed(
    roomIntegrity.occupiedBeds,
    roomIntegrity.physicalBeds,
    input.targetBedCount,
  );

  const currentBeds = await db
    .select({ bedId: beds.id, bedCode: beds.bedCode, status: beds.status })
    .from(beds)
    .where(and(eq(beds.roomId, roomId), isNull(beds.archivedAt)))
    .orderBy(asc(beds.bedCode));

  const delta = input.targetBedCount - currentBeds.length;

  if (delta > 0) {
    const pricing = input.pricing;
    if (
      !pricing ||
      (pricing.monthlyRatePaise <= 0 && pricing.dailyRatePaise <= 0 && pricing.weeklyRatePaise <= 0)
    ) {
      throw new Error('Set rent for new beds before increasing room capacity.');
    }

    const [roomRow] = await db
      .select({ roomNumber: rooms.roomNumber, floorId: rooms.floorId, roomTypeId: rooms.roomTypeId })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);
    const [floorRow] = roomRow
      ? await db
          .select({ floorNumber: floors.floorNumber })
          .from(floors)
          .where(eq(floors.id, roomRow.floorId))
          .limit(1)
      : [];
    const [typeRow] = roomRow
      ? await db
          .select({ hasAc: roomTypes.hasAc })
          .from(roomTypes)
          .where(eq(roomTypes.id, roomRow.roomTypeId))
          .limit(1)
      : [];

    if (!roomRow || !floorRow) throw new Error('Room not found.');

    await quickAddRoomBeds(session, pgId, {
      floorNumber: floorRow.floorNumber,
      roomNumber: roomRow.roomNumber,
      roomTypeName: input.roomTypeName,
      sharingCount: input.targetBedCount,
      bedsToAdd: delta,
      hasAc: input.hasAc ?? typeRow?.hasAc ?? false,
      dailyRatePaise: pricing.dailyRatePaise,
      weeklyRatePaise: pricing.weeklyRatePaise,
      monthlyRatePaise: pricing.monthlyRatePaise,
      dailyDepositPaise: pricing.dailyDepositPaise,
      weeklyDepositPaise: pricing.weeklyDepositPaise,
      monthlyDepositPaise: pricing.monthlyDepositPaise,
    });
  } else if (delta < 0) {
    const toRemove = Math.abs(delta);
    const removable = [...currentBeds].reverse();
    let removed = 0;

    for (const bed of removable) {
      if (removed >= toRemove) break;
      const block = await import('@/src/lib/bedOccupancyCheck').then((m) =>
        m.getBedArchiveBlockReason(bed.bedId),
      );
      if (block) {
        throw new Error(
          `Cannot reduce to ${input.targetBedCount} beds — ${bed.bedCode} is blocked: ${block.message}`,
        );
      }
      await archiveBed(session, pgId, bed.bedId);
      removed += 1;
    }

    if (removed < toRemove) {
      throw new Error('Could not remove enough empty beds to reduce room capacity.');
    }
  }

  const [roomMeta] = await db
    .select({ roomTypeId: rooms.roomTypeId })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!roomMeta) throw new Error('Room not found.');

  await assignRoomTypeForRoom(pgId, roomId, roomMeta.roomTypeId, {
    roomTypeName: input.roomTypeName,
    sharingCount: input.targetBedCount,
    hasAc: input.hasAc ?? false,
  });

  await assertRoomIntegrityOrThrow(roomId);
}

/** Rename a bed code within its room. */
export async function updateBedCode(
  session: AdminSession,
  pgId: string,
  bedId: string,
  bedCode: string,
): Promise<void> {
  assertPgAccess(session, pgId);
  await assertBedInPg(pgId, bedId);

  const trimmed = bedCode.trim();
  if (!trimmed) throw new Error('Bed code is required.');

  const [bedRow] = await db
    .select({ roomId: beds.roomId })
    .from(beds)
    .where(eq(beds.id, bedId))
    .limit(1);
  if (!bedRow) throw new Error('Bed not found.');

  const [conflict] = await db
    .select({ id: beds.id })
    .from(beds)
    .where(
      and(
        eq(beds.roomId, bedRow.roomId),
        eq(beds.bedCode, trimmed),
        isNull(beds.archivedAt),
        sql`${beds.id} <> ${bedId}`,
      ),
    )
    .limit(1);
  if (conflict) throw new Error(`Bed code "${trimmed}" already exists in this room.`);

  await db
    .update(beds)
    .set({ bedCode: trimmed, updatedAt: new Date() })
    .where(eq(beds.id, bedId));
}

/** Move an empty bed to another room in the same PG. */
export async function moveBedToRoom(
  session: AdminSession,
  pgId: string,
  bedId: string,
  targetRoomId: string,
): Promise<void> {
  assertPgAccess(session, pgId);
  await assertBedInPg(pgId, bedId);
  await assertRoomInPg(pgId, targetRoomId);

  const moveBlock = await import('@/src/lib/bedOccupancyCheck').then((m) =>
    m.getBedArchiveBlockReason(bedId),
  );
  if (moveBlock) {
    throw new Error(moveBlock.message.replace(/^Cannot archive/i, 'Cannot move'));
  }

  const [bedRow] = await db
    .select({ roomId: beds.roomId, bedCode: beds.bedCode, status: beds.status })
    .from(beds)
    .where(eq(beds.id, bedId))
    .limit(1);
  if (!bedRow) throw new Error('Bed not found.');
  if (bedRow.roomId === targetRoomId) throw new Error('Bed is already in this room.');

  const targetBeds = await db
    .select({ bedCode: beds.bedCode })
    .from(beds)
    .where(and(eq(beds.roomId, targetRoomId), isNull(beds.archivedAt)));

  if (targetBeds.length >= MAX_ROOM_BEDS) {
    throw new Error(`Target room already has the maximum of ${MAX_ROOM_BEDS} beds.`);
  }

  const [newCode] = nextBedCodesForRoom(
    targetBeds.map((b) => b.bedCode),
    1,
  );
  if (!newCode) throw new Error('Could not assign a bed code in the target room.');

  const sourceRoomId = bedRow.roomId;

  await db
    .update(beds)
    .set({ roomId: targetRoomId, bedCode: newCode, updatedAt: new Date() })
    .where(eq(beds.id, bedId));

  await syncRoomCapacityFromActiveBeds(sourceRoomId);
  await syncRoomCapacityFromActiveBeds(targetRoomId);
  await assertRoomIntegrityOrThrow(sourceRoomId);
  await assertRoomIntegrityOrThrow(targetRoomId);
}
