/**
 * PG-scoped electricity billing checklist — read projection for admin UX.
 * Generation still goes through createElectricityBill (canonical engine).
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, electricityBills, floors, pgs, roomTypes, rooms } from '@/src/db/schema';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import { firstOfMonth, monthBounds } from '@/src/services/billing';
import { formatDate } from '@/src/lib/dates';
import { resolveOfficialPreviousReading } from '@/src/services/meterTimelineService';
import type { RoomPreviousMeterSource } from '@/src/lib/billing/roomMeterReadingSsot';

export type PgElectricityRoomStatus =
  | 'already_billed'
  | 'reading_required'
  | 'previous_unavailable'
  | 'maintenance_excluded'
  | 'not_eligible'
  | 'needs_attention';

export type PgElectricityChecklistRoom = {
  roomId: string;
  roomNumber: string;
  status: PgElectricityRoomStatus;
  previousReadingUnits: number | null;
  previousReadingSource: RoomPreviousMeterSource | null;
  previousBillingMonthLabel: string | null;
  ratePerUnitPaise: number;
  billId: string | null;
  billTotalPaise: number | null;
  activeBedCount: number;
  maintenanceBedCount: number;
  billableOccupantCount: number;
};

export type PgElectricityChecklistSummary = {
  totalRooms: number;
  alreadyBilled: number;
  readingRequired: number;
  previousUnavailable: number;
  maintenanceExcluded: number;
  notEligible: number;
  needsAttention: number;
  hasAnyBillActivity: boolean;
};

export type PgElectricityBillingChecklist = {
  billingMonth: string;
  monthLabel: string;
  pgId: string;
  pgName: string;
  ratePerUnitPaise: number;
  rooms: PgElectricityChecklistRoom[];
  summary: PgElectricityChecklistSummary;
};

function monthLabel(billingMonth: string): string {
  return new Date(`${billingMonth.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function billingMonthLabel(iso: string | null): string | null {
  if (!iso) return null;
  return monthLabel(iso);
}

export async function listActivePgsForElectricityBilling(): Promise<
  Array<{ id: string; name: string }>
> {
  const rows = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(sql`${pgs.archivedAt} IS NULL`)
    .orderBy(pgs.name);
  return rows;
}

/**
 * Full AC-room checklist for one PG + billing month.
 * Room under maintenance = every non-archived bed is maintenance (room-level effect).
 * One bed in maintenance does NOT exclude the room.
 */
export async function loadPgElectricityBillingChecklist(input: {
  pgId: string;
  billingMonth: string;
}): Promise<PgElectricityBillingChecklist | null> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);

  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(and(eq(pgs.id, input.pgId), sql`${pgs.archivedAt} IS NULL`))
    .limit(1);
  if (!pg) return null;

  const acRooms = await db
    .select({
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
    })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(
      and(
        eq(floors.pgId, input.pgId),
        sql`${rooms.archivedAt} IS NULL`,
        eq(roomTypes.hasAc, true),
      ),
    )
    .orderBy(rooms.roomNumber);

  const checklistRooms: PgElectricityChecklistRoom[] = [];

  for (const room of acRooms) {
    const bedStats = await db.execute<{
      active_beds: number;
      maintenance_beds: number;
      total_beds: number;
    }>(sql`
      SELECT
        count(*) FILTER (WHERE bd.status != 'maintenance')::int AS active_beds,
        count(*) FILTER (WHERE bd.status = 'maintenance')::int AS maintenance_beds,
        count(*)::int AS total_beds
      FROM beds bd
      WHERE bd.room_id = ${room.roomId}::uuid
        AND bd.archived_at IS NULL
    `);
    const activeBedCount = Number(bedStats[0]?.active_beds ?? 0);
    const maintenanceBedCount = Number(bedStats[0]?.maintenance_beds ?? 0);
    const totalBeds = Number(bedStats[0]?.total_beds ?? 0);

    const [existingBill] = await db
      .select({
        id: electricityBills.id,
        totalPaise: electricityBills.totalPaise,
      })
      .from(electricityBills)
      .where(
        and(
          eq(electricityBills.roomId, room.roomId),
          eq(electricityBills.billingMonth, billingMonth),
          eq(electricityBills.isPipelineTest, false),
        ),
      )
      .limit(1);

    if (existingBill) {
      checklistRooms.push({
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        status: 'already_billed',
        previousReadingUnits: null,
        previousReadingSource: null,
        previousBillingMonthLabel: null,
        ratePerUnitPaise: DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
        billId: existingBill.id,
        billTotalPaise: existingBill.totalPaise,
        activeBedCount,
        maintenanceBedCount,
        billableOccupantCount: 0,
      });
      continue;
    }

    // Whole room under maintenance: has beds, but none available for electricity occupancy.
    if (totalBeds > 0 && activeBedCount === 0) {
      checklistRooms.push({
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        status: 'maintenance_excluded',
        previousReadingUnits: null,
        previousReadingSource: null,
        previousBillingMonthLabel: null,
        ratePerUnitPaise: DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
        billId: null,
        billTotalPaise: null,
        activeBedCount,
        maintenanceBedCount,
        billableOccupantCount: 0,
      });
      continue;
    }

    const occupants = await db.execute<{ count: number }>(sql`
      SELECT count(DISTINCT b.id)::int AS count
      FROM bed_reservations br
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN bookings b ON b.id = br.booking_id
      WHERE bd.room_id = ${room.roomId}::uuid
        AND bd.archived_at IS NULL
        AND bd.status != 'maintenance'
        AND br.status = 'active'
        AND b.status = 'confirmed'
        AND b.duration_mode IN ('monthly', 'open_ended')
        AND br.stay_range && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')
    `);
    const billableOccupantCount = Number(occupants[0]?.count ?? 0);

    if (billableOccupantCount === 0) {
      checklistRooms.push({
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        status: 'not_eligible',
        previousReadingUnits: null,
        previousReadingSource: null,
        previousBillingMonthLabel: null,
        ratePerUnitPaise: DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
        billId: null,
        billTotalPaise: null,
        activeBedCount,
        maintenanceBedCount,
        billableOccupantCount,
      });
      continue;
    }

    const baseline = await resolveOfficialPreviousReading(room.roomId, billingMonth);
    if (baseline.source === 'none') {
      checklistRooms.push({
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        status: 'previous_unavailable',
        previousReadingUnits: null,
        previousReadingSource: 'none',
        previousBillingMonthLabel: null,
        ratePerUnitPaise: baseline.ratePerUnitPaise,
        billId: null,
        billTotalPaise: null,
        activeBedCount,
        maintenanceBedCount,
        billableOccupantCount,
      });
      continue;
    }

    checklistRooms.push({
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      status: 'reading_required',
      previousReadingUnits: baseline.previousReadingUnits,
      previousReadingSource: baseline.source,
      previousBillingMonthLabel: billingMonthLabel(baseline.lastBillingMonth),
      ratePerUnitPaise: baseline.ratePerUnitPaise,
      billId: null,
      billTotalPaise: null,
      activeBedCount,
      maintenanceBedCount,
      billableOccupantCount,
    });
  }

  const summary: PgElectricityChecklistSummary = {
    totalRooms: checklistRooms.length,
    alreadyBilled: checklistRooms.filter((r) => r.status === 'already_billed').length,
    readingRequired: checklistRooms.filter((r) => r.status === 'reading_required').length,
    previousUnavailable: checklistRooms.filter((r) => r.status === 'previous_unavailable').length,
    maintenanceExcluded: checklistRooms.filter((r) => r.status === 'maintenance_excluded').length,
    notEligible: checklistRooms.filter((r) => r.status === 'not_eligible').length,
    needsAttention: checklistRooms.filter(
      (r) => r.status === 'previous_unavailable' || r.status === 'needs_attention',
    ).length,
    hasAnyBillActivity: checklistRooms.some((r) => r.status === 'already_billed'),
  };

  return {
    billingMonth,
    monthLabel: monthLabel(billingMonth),
    pgId: pg.id,
    pgName: pg.name,
    ratePerUnitPaise: DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
    rooms: checklistRooms,
    summary,
  };
}
