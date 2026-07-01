/**
 * Convert Shantinagar Room 201 from double-sharing inventory to permanent single sharing,
 * matching Room 101 structure (1 bed, per-bed billing, identical catalog pricing).
 */
import { and, eq, ilike, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  residentResidencies,
  rooms,
  roomTypes,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { formatDate } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';
import {
  syncAllBillingProfilesForPg,
  syncBillingProfileRentFromSsot,
  syncPendingRentInvoicesFromSsot,
} from '@/src/lib/billing/rentPricingSsot';
import { countOccupiedBedsSsot } from '@/src/services/occupancyDiagnostics';
import { archiveBed, updateRoomBedPricing, updateRoomDetails } from '@/src/services/pgInventory';
import { loadBedPrice } from '@/src/services/pricing';
import { revalidateOccupancyViews } from '@/src/lib/occupancyRevalidate';
import { revalidatePricingViews } from '@/src/lib/pricingRevalidate';
import { JULY_BILLING_MONTH } from '@/src/services/shantinagarJulyRentProduction';

const REFERENCE_ROOM = '101';
const TARGET_ROOM = '201';

export type Room201ConversionReport = {
  dryRun: boolean;
  pgId: string;
  pgSlug: string;
  room201: {
    roomId: string;
    capacityBefore: number;
    capacityAfter: number;
    billingModeBefore: string;
    billingModeAfter: string;
    remainingBedId: string;
    remainingBedCode: string;
    removedBedId: string;
    removedBedCode: string;
    monthlyRentPaise: number;
    depositPaise: number;
  };
  resident: {
    name: string;
    bookingId: string;
    bookingCode: string;
    bedBefore: string;
    bedAfter: string;
    reservationMoved: boolean;
  } | null;
  occupancy: {
    totalBedsBefore: number;
    totalBedsAfter: number;
    occupiedBefore: number;
    occupiedAfter: number;
    percentBefore: number;
    percentAfter: number;
  };
  pricingSync: {
    profilesSynced: number;
    invoiceUpdates: number;
  };
  actions: string[];
  pass: boolean;
  issues: string[];
};

type RoomBedRow = {
  roomId: string;
  roomNumber: string;
  bedId: string;
  bedCode: string;
  defaultCapacity: number;
  billingMode: string;
  roomTypeName: string;
  hasAc: boolean;
  floorNumber: number;
};

async function resolveShantinagarPg() {
  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name, slug: pgs.slug })
    .from(pgs)
    .where(ilike(pgs.name, '%shanti%'))
    .limit(1);
  return pg ?? null;
}

async function loadRoomBeds(pgId: string, roomNumber: string): Promise<RoomBedRow[]> {
  return db
    .select({
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      bedId: beds.id,
      bedCode: beds.bedCode,
      defaultCapacity: roomTypes.defaultCapacity,
      billingMode: rooms.billingMode,
      roomTypeName: roomTypes.name,
      hasAc: roomTypes.hasAc,
      floorNumber: floors.floorNumber,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(floors.pgId, pgId),
        eq(rooms.roomNumber, roomNumber),
        isNull(beds.archivedAt),
        isNull(rooms.archivedAt),
      ),
    )
    .orderBy(beds.bedCode);
}

async function countPgBeds(pgId: string): Promise<{ total: number; occupied: number }> {
  const rows = await db.execute<{ total: number; occupied: number }>(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM bed_reservations br
        INNER JOIN bookings bk ON bk.id = br.booking_id
        WHERE br.bed_id = beds.id
          AND br.status = 'active'
          AND bk.status = 'confirmed'
          AND CURRENT_DATE <@ br.stay_range
      ))::int AS occupied
    FROM beds
    INNER JOIN rooms r ON r.id = beds.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pgId}::uuid AND beds.archived_at IS NULL
  `);
  return { total: rows[0]?.total ?? 0, occupied: rows[0]?.occupied ?? 0 };
}

async function findActiveResidentInRoom(pgId: string, roomNumber: string) {
  const rows = await db
    .select({
      customerName: customers.fullName,
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      reservationId: bedReservations.id,
      bedId: beds.id,
      bedCode: beds.bedCode,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(floors.pgId, pgId),
        eq(rooms.roomNumber, roomNumber),
        eq(bookings.status, 'confirmed'),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    );
  return rows[0] ?? null;
}

async function loadReferencePricing(pgId: string) {
  const refBeds = await loadRoomBeds(pgId, REFERENCE_ROOM);
  const refBed = refBeds.find((b) => b.bedCode === 'B1') ?? refBeds[0];
  if (!refBed) throw new Error(`Reference room ${REFERENCE_ROOM} has no active bed.`);

  const price = await loadBedPrice(refBed.bedId, formatDate(new Date()));
  if (!price || price.monthlyRatePaise <= 0) {
    throw new Error(`Reference room ${REFERENCE_ROOM} bed ${refBed.bedCode} has no monthly rate.`);
  }

  const depositPaise =
    price.monthlySecurityDepositPaise > 0
      ? price.monthlySecurityDepositPaise
      : price.securityDepositPaise;

  return {
    refBed,
    monthlyRatePaise: price.monthlyRatePaise,
    depositPaise,
    dailyRatePaise: price.dailyRatePaise,
    weeklyRatePaise: price.weeklyRatePaise,
    dailyDepositPaise: price.dailySecurityDepositPaise,
    weeklyDepositPaise: price.weeklySecurityDepositPaise,
  };
}

export async function convertRoom201ToSingleSharing(input: {
  session: AdminSession;
  dryRun?: boolean;
  billingMonth?: string;
}): Promise<Room201ConversionReport> {
  const dryRun = input.dryRun ?? false;
  const billingMonth = input.billingMonth ?? JULY_BILLING_MONTH;
  const actions: string[] = [];
  const issues: string[] = [];

  const pg = await resolveShantinagarPg();
  if (!pg) throw new Error('Shantinagar PG not found.');

  const room201BedsBefore = await loadRoomBeds(pg.id, TARGET_ROOM);
  if (room201BedsBefore.length === 0) {
    throw new Error(`Room ${TARGET_ROOM} not found or has no beds.`);
  }
  if (room201BedsBefore.length === 1) {
    issues.push(`Room ${TARGET_ROOM} already has a single active bed — conversion may already be done.`);
  }

  const bedCountsBefore = await countPgBeds(pg.id);
  const occupiedBefore = await countOccupiedBedsSsot();
  const percentBefore =
    bedCountsBefore.total > 0
      ? Math.round((bedCountsBefore.occupied / bedCountsBefore.total) * 1000) / 10
      : 0;

  const reference = await loadReferencePricing(pg.id);
  const resident = await findActiveResidentInRoom(pg.id, TARGET_ROOM);

  const keepBed =
    room201BedsBefore.find((b) => b.bedCode === 'B1') ?? room201BedsBefore[0]!;
  const removeBed = room201BedsBefore.find((b) => b.bedId !== keepBed.bedId);

  if (!removeBed && room201BedsBefore.length > 1) {
    throw new Error(`Could not identify second bed to remove in room ${TARGET_ROOM}.`);
  }

  if (resident && resident.bedId !== keepBed.bedId) {
    actions.push(
      `Move ${resident.customerName} reservation from ${TARGET_ROOM}-${resident.bedCode} → ${TARGET_ROOM}-${keepBed.bedCode}`,
    );
  } else if (resident) {
    actions.push(`${resident.customerName} already on ${TARGET_ROOM}-${keepBed.bedCode}`);
  }

  if (removeBed) {
    actions.push(`Archive bed ${TARGET_ROOM}-${removeBed.bedCode} (${removeBed.bedId})`);
  }
  actions.push(
    `Set room ${TARGET_ROOM} to 1 Sharing (per-bed billing) with rent ${paiseToInr(reference.monthlyRatePaise)} / deposit ${paiseToInr(reference.depositPaise)}`,
  );
  actions.push('Sync billing profiles and pending rent invoices from SSOT');

  if (!dryRun) {
    if (resident && resident.bedId !== keepBed.bedId) {
      await db
        .update(bedReservations)
        .set({ bedId: keepBed.bedId, updatedAt: new Date() })
        .where(eq(bedReservations.id, resident.reservationId));

      await db
        .update(residentResidencies)
        .set({ currentBedId: keepBed.bedId, updatedAt: new Date() })
        .where(eq(residentResidencies.currentBookingId, resident.bookingId));

      await db.insert(auditLog).values({
        actorType: 'system',
        entity: 'bed_reservation',
        entityId: resident.reservationId,
        action: 'room201_single_sharing_move',
        diff: {
          fromBedId: resident.bedId,
          toBedId: keepBed.bedId,
          bookingId: resident.bookingId,
        },
      });
    }

    if (removeBed) {
      await archiveBed(input.session, pg.id, removeBed.bedId);
    }

    const roomMeta = room201BedsBefore[0]!;
    await updateRoomDetails(input.session, pg.id, roomMeta.roomId, {
      floorNumber: roomMeta.floorNumber,
      roomNumber: TARGET_ROOM,
      roomTypeName: reference.refBed.roomTypeName,
      sharingCount: 1,
      hasAc: reference.refBed.hasAc,
      notes: `Permanent single sharing — inventory aligned with Room ${REFERENCE_ROOM}.`,
    });

    await db
      .update(rooms)
      .set({
        billingMode: 'per_bed',
        privateRoomMonthlyRentPaise: null,
        updatedAt: new Date(),
      })
      .where(eq(rooms.id, roomMeta.roomId));

    await updateRoomBedPricing(
      input.session,
      pg.id,
      roomMeta.roomId,
      {
        dailyRatePaise: reference.dailyRatePaise,
        weeklyRatePaise: reference.weeklyRatePaise,
        monthlyRatePaise: reference.monthlyRatePaise,
        dailyDepositPaise: reference.dailyDepositPaise,
        weeklyDepositPaise: reference.weeklyDepositPaise,
        monthlyDepositPaise: reference.depositPaise,
      },
      { affectExistingTenants: true },
    );

    if (resident) {
      await syncBillingProfileRentFromSsot(resident.bookingId, billingMonth);
      await syncPendingRentInvoicesFromSsot(resident.bookingId, billingMonth);
    }

    revalidatePricingViews(pg.slug);
    revalidateOccupancyViews();
  }

  let profilesSynced = 0;
  if (!dryRun) {
    const profileSync = await syncAllBillingProfilesForPg(pg.id, billingMonth);
    profilesSynced = profileSync.synced;
    actions.push(`Billing profiles synced: ${profilesSynced}`);
  }

  const room201BedsAfter = dryRun
    ? room201BedsBefore.filter((b) => b.bedId === keepBed.bedId)
    : await loadRoomBeds(pg.id, TARGET_ROOM);
  const bedCountsAfter = dryRun
    ? {
        total: bedCountsBefore.total - (removeBed ? 1 : 0),
        occupied: bedCountsBefore.occupied,
      }
    : await countPgBeds(pg.id);
  const occupiedAfter = dryRun ? occupiedBefore : await countOccupiedBedsSsot();
  const percentAfter =
    bedCountsAfter.total > 0
      ? Math.round((bedCountsAfter.occupied / bedCountsAfter.total) * 1000) / 10
      : 0;

  let invoiceUpdates = 0;
  if (!dryRun && resident) {
    const inv = await syncPendingRentInvoicesFromSsot(resident.bookingId, billingMonth);
    invoiceUpdates = inv.updated;
  }

  if (room201BedsAfter.length !== 1) {
    issues.push(`Expected 1 active bed in room ${TARGET_ROOM}, found ${room201BedsAfter.length}.`);
  }
  if (!dryRun) {
    const [roomRow] = await db
      .select({ billingMode: rooms.billingMode })
      .from(rooms)
      .where(eq(rooms.id, room201BedsBefore[0]!.roomId))
      .limit(1);
    if (roomRow?.billingMode !== 'per_bed') {
      issues.push(`Room ${TARGET_ROOM} billing_mode is not per_bed.`);
    }
  }

  const residentAfter = dryRun
    ? resident
      ? { ...resident, bedCode: keepBed.bedCode, bedId: keepBed.bedId }
      : null
    : await findActiveResidentInRoom(pg.id, TARGET_ROOM);

  return {
    dryRun,
    pgId: pg.id,
    pgSlug: pg.slug,
    room201: {
      roomId: room201BedsBefore[0]!.roomId,
      capacityBefore: room201BedsBefore[0]!.defaultCapacity,
      capacityAfter: 1,
      billingModeBefore: room201BedsBefore[0]!.billingMode,
      billingModeAfter: 'per_bed',
      remainingBedId: keepBed.bedId,
      remainingBedCode: keepBed.bedCode,
      removedBedId: removeBed?.bedId ?? '',
      removedBedCode: removeBed?.bedCode ?? '',
      monthlyRentPaise: reference.monthlyRatePaise,
      depositPaise: reference.depositPaise,
    },
    resident: residentAfter
      ? {
          name: residentAfter.customerName,
          bookingId: residentAfter.bookingId,
          bookingCode: residentAfter.bookingCode,
          bedBefore: resident?.bedCode ?? keepBed.bedCode,
          bedAfter: residentAfter.bedCode,
          reservationMoved: Boolean(resident && resident.bedId !== keepBed.bedId),
        }
      : null,
    occupancy: {
      totalBedsBefore: bedCountsBefore.total,
      totalBedsAfter: bedCountsAfter.total,
      occupiedBefore,
      occupiedAfter,
      percentBefore,
      percentAfter,
    },
    pricingSync: {
      profilesSynced,
      invoiceUpdates,
    },
    actions,
    pass: issues.length === 0,
    issues,
  };
}
