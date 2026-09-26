/**
 * Future-dated room configuration (sharing + rent + deposit) — Engine workflow.
 */

import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedPrices,
  bedReservations,
  beds,
  bookings,
  floors,
  roomConfigurationSchedules,
  rooms,
  roomTypes,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { formatDate, parseDate, todayString } from '@/src/lib/dates';
import {
  assertFutureEffectiveDate,
  defaultRoomConfigurationEffectiveFrom,
} from '@/src/lib/roomConfiguration/effectiveDate';
import {
  pricingFromScheduleRow,
  type RoomConfigurationEffectiveOn,
} from '@/src/lib/roomConfiguration/ssot';
import { countActiveBedsInRoom } from '@/src/lib/roomCapacitySsotDb';
import { planRoomCapacityDecrease } from '@/src/lib/roomCapacityBedPlanner';
import { validateRoomById } from '@/src/services/roomIntegrityValidator';
import { computeMonthlyDepositPaise, loadBedPrice } from '@/src/services/pricing';
import type { BedPricingInput } from '@/src/services/pgInventory';
import { resizeRoomCapacity, type ResizeRoomCapacityInput } from '@/src/services/pgInventory';
import { writeBedPriceVersion } from '@/src/services/pgInventoryPricing';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { sharingTypeName } from '@/src/lib/roomSharing';

export type ScheduleRoomConfigurationInput = {
  roomId: string;
  effectiveFrom: string;
  targetBedCount: number;
  roomTypeName: string;
  hasAc: boolean;
  pricing: BedPricingInput;
};

export type RoomConfigurationSchedulePreview = {
  current: {
    bedCount: number;
    roomTypeName: string;
    monthlyRatePaise: number;
    monthlyDepositPaise: number;
  };
  proposed: {
    bedCount: number;
    roomTypeName: string;
    monthlyRatePaise: number;
    monthlyDepositPaise: number;
    effectiveFrom: string;
  };
  depositDifferencePaise: number;
  defaultEffectiveFrom: string;
  blocked: boolean;
  blockMessage?: string;
};

function assertPgRoomAccess(session: AdminSession, pgId: string, roomId: string): void {
  if (!adminCanAccessPg(session, pgId)) {
    throw new Error('Not allowed.');
  }
  void roomId;
}

async function roomPgId(roomId: string): Promise<string | null> {
  const [row] = await db
    .select({ pgId: floors.pgId })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(and(eq(rooms.id, roomId), isNull(rooms.archivedAt)))
    .limit(1);
  return row?.pgId ?? null;
}

async function countOccupiedBedsInRoom(roomId: string): Promise<number> {
  const snap = await validateRoomById(roomId);
  return snap?.occupiedBeds ?? 0;
}

async function currentRoomCatalogSnapshot(roomId: string): Promise<{
  bedCount: number;
  roomTypeName: string;
  monthlyRatePaise: number;
  monthlyDepositPaise: number;
  hasAc: boolean;
}> {
  const bedCount = await countActiveBedsInRoom(roomId);
  const [meta] = await db
    .select({ name: roomTypes.name, hasAc: roomTypes.hasAc })
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(eq(rooms.id, roomId))
    .limit(1);
  const [firstBed] = await db
    .select({ id: beds.id })
    .from(beds)
    .where(and(eq(beds.roomId, roomId), isNull(beds.archivedAt)))
    .orderBy(asc(beds.bedCode))
    .limit(1);
  let monthlyRatePaise = 0;
  let monthlyDepositPaise = 0;
  if (firstBed) {
    const rate = await loadBedPrice(firstBed.id, todayString());
    if (rate) {
      monthlyRatePaise = rate.monthlyRatePaise;
      monthlyDepositPaise = computeMonthlyDepositPaise(rate);
    }
  }
  return {
    bedCount,
    roomTypeName: meta?.name ?? sharingTypeName(bedCount),
    monthlyRatePaise,
    monthlyDepositPaise,
    hasAc: meta?.hasAc ?? false,
  };
}

export async function previewRoomConfigurationSchedule(
  roomId: string,
  input: Omit<ScheduleRoomConfigurationInput, 'roomId'>,
): Promise<RoomConfigurationSchedulePreview> {
  const current = await currentRoomCatalogSnapshot(roomId);
  const depositDifferencePaise = Math.max(
    0,
    input.pricing.monthlyDepositPaise - current.monthlyDepositPaise,
  );

  let blocked = false;
  let blockMessage: string | undefined;

  if (input.targetBedCount < current.bedCount) {
    const activeBeds = await db
      .select({
        id: beds.id,
        bedCode: beds.bedCode,
      })
      .from(beds)
      .where(and(eq(beds.roomId, roomId), isNull(beds.archivedAt)));
    const occupiedSet = new Set<string>();
    for (const bed of activeBeds) {
      const { getBedArchiveBlockReason } = await import('@/src/lib/bedOccupancyCheck');
      const block = await getBedArchiveBlockReason(bed.id);
      if (block?.reason === 'occupied') occupiedSet.add(bed.id);
    }
    const plan = planRoomCapacityDecrease({
      activeBeds: activeBeds.map((b) => ({
        id: b.id,
        bedCode: b.bedCode,
        occupied: occupiedSet.has(b.id),
      })),
      targetBedCount: input.targetBedCount,
    });
    if (plan.blocked) {
      blocked = true;
      blockMessage = plan.blockMessage;
    }
    const occupiedCount = await countOccupiedBedsInRoom(roomId);
    if (occupiedCount > input.targetBedCount) {
      blocked = true;
      blockMessage = `Room has ${occupiedCount} active resident${occupiedCount === 1 ? '' : 's'} but the new configuration allows ${input.targetBedCount}. Resolve move-outs or transfers before scheduling.`;
    }
  }

  return {
    current: {
      bedCount: current.bedCount,
      roomTypeName: current.roomTypeName,
      monthlyRatePaise: current.monthlyRatePaise,
      monthlyDepositPaise: current.monthlyDepositPaise,
    },
    proposed: {
      bedCount: input.targetBedCount,
      roomTypeName: input.roomTypeName,
      monthlyRatePaise: input.pricing.monthlyRatePaise,
      monthlyDepositPaise: input.pricing.monthlyDepositPaise,
      effectiveFrom: input.effectiveFrom,
    },
    depositDifferencePaise,
    defaultEffectiveFrom: defaultRoomConfigurationEffectiveFrom(),
    blocked,
    blockMessage,
  };
}

async function assertNoScheduleConflict(roomId: string, effectiveFrom: string): Promise<void> {
  const [existing] = await db
    .select({ id: roomConfigurationSchedules.id })
    .from(roomConfigurationSchedules)
    .where(
      and(
        eq(roomConfigurationSchedules.roomId, roomId),
        eq(roomConfigurationSchedules.status, 'scheduled'),
        eq(roomConfigurationSchedules.effectiveFrom, effectiveFrom),
      ),
    )
    .limit(1);
  if (existing) {
    throw new Error(`A configuration change is already scheduled for ${formatDate(parseDate(effectiveFrom))}.`);
  }
}

async function writeScheduledBedPricesForRoom(
  roomId: string,
  effectiveFrom: string,
  pricing: BedPricingInput,
): Promise<void> {
  const roomBeds = await db
    .select({ bedId: beds.id })
    .from(beds)
    .where(and(eq(beds.roomId, roomId), isNull(beds.archivedAt)));
  const monthlyDep = pricing.monthlyDepositPaise;
  for (const { bedId } of roomBeds) {
    await writeBedPriceVersion(
      {
        bedId,
        dailyRatePaise: pricing.dailyRatePaise,
        weeklyRatePaise: pricing.weeklyRatePaise,
        monthlyRatePaise: pricing.monthlyRatePaise,
        securityDepositPaise: monthlyDep,
        dailySecurityDepositPaise: pricing.dailyDepositPaise,
        weeklySecurityDepositPaise: pricing.weeklyDepositPaise,
        monthlySecurityDepositPaise: monthlyDep,
      },
      effectiveFrom,
    );
  }
}

export async function scheduleRoomConfigurationChange(
  session: AdminSession,
  pgId: string,
  input: ScheduleRoomConfigurationInput,
): Promise<{ scheduleId: string }> {
  const roomPg = await roomPgId(input.roomId);
  if (roomPg !== pgId) throw new Error('Room not found.');
  assertPgRoomAccess(session, pgId, input.roomId);
  assertFutureEffectiveDate(input.effectiveFrom);

  const preview = await previewRoomConfigurationSchedule(input.roomId, input);
  if (preview.blocked) {
    throw new Error(preview.blockMessage ?? 'Cannot schedule this configuration change.');
  }
  await assertNoScheduleConflict(input.roomId, input.effectiveFrom);

  const current = await currentRoomCatalogSnapshot(input.roomId);

  const [row] = await db
    .insert(roomConfigurationSchedules)
    .values({
      pgId,
      roomId: input.roomId,
      status: 'scheduled',
      effectiveFrom: input.effectiveFrom,
      targetBedCount: input.targetBedCount,
      roomTypeName: input.roomTypeName,
      hasAc: input.hasAc,
      dailyRatePaise: input.pricing.dailyRatePaise,
      weeklyRatePaise: input.pricing.weeklyRatePaise,
      monthlyRatePaise: input.pricing.monthlyRatePaise,
      dailyDepositPaise: input.pricing.dailyDepositPaise,
      weeklyDepositPaise: input.pricing.weeklyDepositPaise,
      monthlyDepositPaise: input.pricing.monthlyDepositPaise,
      previousSnapshot: {
        bedCount: current.bedCount,
        roomTypeName: current.roomTypeName,
        monthlyRatePaise: current.monthlyRatePaise,
        monthlyDepositPaise: current.monthlyDepositPaise,
      },
      createdByAdminId: session.adminId,
    })
    .returning({ id: roomConfigurationSchedules.id });

  await writeScheduledBedPricesForRoom(input.roomId, input.effectiveFrom, input.pricing);

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: session.adminId,
    entity: 'room_configuration_schedule',
    entityId: row.id,
    action: 'scheduled',
    diff: {
      roomId: input.roomId,
      effectiveFrom: input.effectiveFrom,
      targetBedCount: input.targetBedCount,
      monthlyRatePaise: input.pricing.monthlyRatePaise,
      monthlyDepositPaise: input.pricing.monthlyDepositPaise,
    },
  });

  return { scheduleId: row.id };
}

export async function listScheduledRoomConfigurationsForPg(pgId: string) {
  return db
    .select()
    .from(roomConfigurationSchedules)
    .where(
      and(
        eq(roomConfigurationSchedules.pgId, pgId),
        eq(roomConfigurationSchedules.status, 'scheduled'),
      ),
    )
    .orderBy(asc(roomConfigurationSchedules.effectiveFrom));
}

export type ScheduledRoomConfigurationSummary = {
  scheduleId: string;
  roomId: string;
  effectiveFrom: string;
  targetBedCount: number;
  roomTypeName: string;
  monthlyRatePaise: number;
  monthlyDepositPaise: number;
};

export async function getScheduledRoomConfigurationsByRoomForPg(
  pgId: string,
): Promise<Map<string, ScheduledRoomConfigurationSummary[]>> {
  const rows = await listScheduledRoomConfigurationsForPg(pgId);
  const map = new Map<string, ScheduledRoomConfigurationSummary[]>();
  for (const row of rows) {
    const list = map.get(row.roomId) ?? [];
    list.push({
      scheduleId: row.id,
      roomId: row.roomId,
      effectiveFrom: row.effectiveFrom,
      targetBedCount: row.targetBedCount,
      roomTypeName: row.roomTypeName,
      monthlyRatePaise: row.monthlyRatePaise,
      monthlyDepositPaise: row.monthlyDepositPaise,
    });
    map.set(row.roomId, list);
  }
  return map;
}

export async function listRoomConfigurationSchedules(roomId: string) {
  return db
    .select()
    .from(roomConfigurationSchedules)
    .where(eq(roomConfigurationSchedules.roomId, roomId))
    .orderBy(desc(roomConfigurationSchedules.effectiveFrom));
}

export async function getActiveScheduledRoomConfiguration(roomId: string) {
  const [row] = await db
    .select()
    .from(roomConfigurationSchedules)
    .where(
      and(
        eq(roomConfigurationSchedules.roomId, roomId),
        eq(roomConfigurationSchedules.status, 'scheduled'),
      ),
    )
    .orderBy(asc(roomConfigurationSchedules.effectiveFrom))
    .limit(1);
  return row ?? null;
}

async function revertFutureBedPricesForSchedule(roomId: string, effectiveFrom: string): Promise<void> {
  const bedRows = await db
    .select({ bedId: beds.id })
    .from(beds)
    .where(eq(beds.roomId, roomId));
  const bedIds = bedRows.map((b) => b.bedId);
  if (bedIds.length === 0) return;

  const today = todayString();
  await db.transaction(async (tx) => {
    const futureRows = await tx
      .select()
      .from(bedPrices)
      .where(
        and(
          inArray(bedPrices.bedId, bedIds),
          eq(bedPrices.effectiveFrom, effectiveFrom),
          gt(bedPrices.effectiveFrom, today),
        ),
      );
    for (const row of futureRows) {
      await tx.delete(bedPrices).where(eq(bedPrices.id, row.id));
      const [prior] = await tx
        .select()
        .from(bedPrices)
        .where(
          and(
            eq(bedPrices.bedId, row.bedId),
            lte(bedPrices.effectiveFrom, today),
            or(isNull(bedPrices.effectiveTo), sql`${bedPrices.effectiveTo} > ${today}::date`),
          ),
        )
        .orderBy(desc(bedPrices.effectiveFrom))
        .limit(1);
      if (prior && prior.effectiveTo === effectiveFrom) {
        await tx
          .update(bedPrices)
          .set({ effectiveTo: null, updatedAt: new Date() })
          .where(eq(bedPrices.id, prior.id));
      }
    }
  });
}

export async function cancelRoomConfigurationSchedule(
  session: AdminSession,
  pgId: string,
  scheduleId: string,
  reason?: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(roomConfigurationSchedules)
    .where(eq(roomConfigurationSchedules.id, scheduleId))
    .limit(1);
  if (!row || row.pgId !== pgId) throw new Error('Schedule not found.');
  assertPgRoomAccess(session, pgId, row.roomId);
  if (row.status !== 'scheduled') {
    throw new Error('Only scheduled changes can be cancelled.');
  }
  if (row.effectiveFrom <= todayString()) {
    throw new Error('Cannot cancel a configuration change on or after its effective date.');
  }

  await revertFutureBedPricesForSchedule(row.roomId, row.effectiveFrom);

  await db
    .update(roomConfigurationSchedules)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelReason: reason ?? 'Cancelled by admin',
      updatedAt: new Date(),
    })
    .where(eq(roomConfigurationSchedules.id, scheduleId));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: session.adminId,
    entity: 'room_configuration_schedule',
    entityId: scheduleId,
    action: 'cancelled',
    diff: { effectiveFrom: row.effectiveFrom },
  });
}

async function applyDepositAdjustmentsForRoom(
  roomId: string,
  effectiveFrom: string,
  adminId: string | null,
): Promise<number> {
  const activeBookings = await db
    .select({
      bookingId: bookings.id,
      bedId: beds.id,
      depositPaise: bookings.depositPaise,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(beds.roomId, roomId),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
        eq(bookings.status, 'confirmed'),
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    );

  let adjusted = 0;
  for (const row of activeBookings) {
    const rate = await loadBedPrice(row.bedId, effectiveFrom);
    if (!rate) continue;
    const newRequired = computeMonthlyDepositPaise(rate);
    if (newRequired <= row.depositPaise) continue;
    const summary = await getDepositSummaryForBooking(row.bookingId);
    const collected = summary?.collectedPaise ?? 0;
    const depositDuePaise = Math.max(0, newRequired - collected);
    await db
      .update(bookings)
      .set({
        depositPaise: newRequired,
        depositDuePaise,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, row.bookingId));
    adjusted += 1;
    if (depositDuePaise > 0) {
      const { ensureDepositDuePaymentLink } = await import('@/src/services/depositCollection');
      await ensureDepositDuePaymentLink(row.bookingId).catch(() => undefined);
    }
    void adminId;
  }
  return adjusted;
}

async function applySingleRoomConfigurationSchedule(
  session: AdminSession,
  scheduleId: string,
  runDate: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(roomConfigurationSchedules)
    .where(eq(roomConfigurationSchedules.id, scheduleId))
    .limit(1);
  if (!row || row.status !== 'scheduled') return;
  if (row.effectiveFrom > runDate) return;

  const currentBedCount = await countActiveBedsInRoom(row.roomId);
  if (row.targetBedCount !== currentBedCount) {
    const pricing: BedPricingInput = {
      dailyRatePaise: row.dailyRatePaise,
      weeklyRatePaise: row.weeklyRatePaise,
      monthlyRatePaise: row.monthlyRatePaise,
      dailyDepositPaise: row.dailyDepositPaise,
      weeklyDepositPaise: row.weeklyDepositPaise,
      monthlyDepositPaise: row.monthlyDepositPaise,
    };
    const resizeInput: ResizeRoomCapacityInput = {
      targetBedCount: row.targetBedCount,
      roomTypeName: row.roomTypeName,
      hasAc: row.hasAc,
      pricing: row.targetBedCount > currentBedCount ? pricing : undefined,
    };
    await resizeRoomCapacity(session, row.pgId, row.roomId, resizeInput);
  } else {
    await resizeRoomCapacity(session, row.pgId, row.roomId, {
      targetBedCount: row.targetBedCount,
      roomTypeName: row.roomTypeName,
      hasAc: row.hasAc,
    });
  }

  await applyDepositAdjustmentsForRoom(row.roomId, row.effectiveFrom, session.adminId);

  await db
    .update(roomConfigurationSchedules)
    .set({
      status: 'applied',
      appliedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(roomConfigurationSchedules.id, scheduleId));

  await db.insert(auditLog).values({
    actorType: session.adminId ? 'admin' : 'system',
    actorId: session.adminId,
    entity: 'room_configuration_schedule',
    entityId: scheduleId,
    action: 'applied',
    diff: { runDate, effectiveFrom: row.effectiveFrom },
  });
}

export const SYSTEM_ROOM_CONFIGURATION_SESSION: AdminSession = {
  kind: 'admin',
  sessionId: 'cron-room-configuration-apply',
  adminId: 'cron-room-configuration-apply',
  email: 'cron@system',
  fullName: 'Room configuration apply job',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

/** Apply all room configuration schedules due on or before runDate. */
export async function applyDueRoomConfigurationSchedules(
  runDate: string,
  session: AdminSession = SYSTEM_ROOM_CONFIGURATION_SESSION,
): Promise<{ applied: number }> {
  const due = await db
    .select({ id: roomConfigurationSchedules.id })
    .from(roomConfigurationSchedules)
    .where(
      and(
        eq(roomConfigurationSchedules.status, 'scheduled'),
        lte(roomConfigurationSchedules.effectiveFrom, runDate),
      ),
    )
    .orderBy(asc(roomConfigurationSchedules.effectiveFrom));

  let applied = 0;
  for (const row of due) {
    await applySingleRoomConfigurationSchedule(session, row.id, runDate);
    applied += 1;
  }
  return { applied };
}

/**
 * Authoritative room configuration for billing / electricity / reports on `asOfDate`.
 */
export async function getRoomConfigurationEffectiveOn(
  roomId: string,
  asOfDate: string,
): Promise<RoomConfigurationEffectiveOn> {
  const physicalBedCount = await countActiveBedsInRoom(roomId);
  const current = await currentRoomCatalogSnapshot(roomId);

  const [schedule] = await db
    .select()
    .from(roomConfigurationSchedules)
    .where(
      and(
        eq(roomConfigurationSchedules.roomId, roomId),
        inArray(roomConfigurationSchedules.status, ['scheduled', 'applied']),
        lte(roomConfigurationSchedules.effectiveFrom, asOfDate),
      ),
    )
    .orderBy(desc(roomConfigurationSchedules.effectiveFrom))
    .limit(1);

  if (schedule) {
    const appliedOrDue =
      schedule.status === 'applied' ||
      (schedule.status === 'scheduled' && schedule.effectiveFrom <= asOfDate);
    if (appliedOrDue) {
      return {
        asOfDate,
        sharingCapacity: schedule.targetBedCount,
        roomTypeName: schedule.roomTypeName,
        hasAc: schedule.hasAc,
        pricing: pricingFromScheduleRow(schedule),
        physicalBedCount,
        fromSchedule: true,
        scheduleId: schedule.id,
        scheduleStatus:
          schedule.status === 'applied' || schedule.status === 'scheduled'
            ? schedule.status
            : undefined,
      };
    }
  }

  const [firstBed] = await db
    .select({ id: beds.id })
    .from(beds)
    .where(and(eq(beds.roomId, roomId), isNull(beds.archivedAt)))
    .orderBy(asc(beds.bedCode))
    .limit(1);
  let pricing = {
    dailyRatePaise: 0,
    weeklyRatePaise: 0,
    monthlyRatePaise: current.monthlyRatePaise,
    dailyDepositPaise: 0,
    weeklyDepositPaise: 0,
    monthlyDepositPaise: current.monthlyDepositPaise,
  };
  if (firstBed) {
    const rate = await loadBedPrice(firstBed.id, asOfDate);
    if (rate) {
      pricing = {
        dailyRatePaise: rate.dailyRatePaise,
        weeklyRatePaise: rate.weeklyRatePaise,
        monthlyRatePaise: rate.monthlyRatePaise,
        dailyDepositPaise: rate.dailySecurityDepositPaise,
        weeklyDepositPaise: rate.weeklySecurityDepositPaise,
        monthlyDepositPaise: computeMonthlyDepositPaise(rate),
      };
    }
  }

  return {
    asOfDate,
    sharingCapacity: physicalBedCount,
    roomTypeName: current.roomTypeName,
    hasAc: current.hasAc,
    pricing,
    physicalBedCount,
    fromSchedule: false,
  };
}

export async function resolveEffectiveBedCountForRoom(
  roomId: string,
  asOfDate?: string,
): Promise<number> {
  const date = asOfDate ?? todayString();
  const config = await getRoomConfigurationEffectiveOn(roomId, date);
  if (config.fromSchedule) return config.sharingCapacity;
  return config.physicalBedCount;
}

export { defaultRoomConfigurationEffectiveFrom } from '@/src/lib/roomConfiguration/effectiveDate';
