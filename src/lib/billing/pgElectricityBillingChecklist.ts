/**
 * PG-scoped electricity billing checklist — read projection for admin UX.
 * Generation still goes through createElectricityBill (canonical engine).
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, electricityBills, pgs } from '@/src/db/schema';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import { listPgRoomsForElectricityBillingInventory } from '@/src/lib/billing/pgElectricityBillingRoomInventory';
import { firstOfMonth } from '@/src/services/billing';
import {
  assessConsumptionMonthContinuityForRoom,
  ConsumptionMonthContinuityError,
  resolveRoomPreviousMeterReading,
} from '@/src/services/roomMeterReadingSsot';
import type { RoomPreviousMeterSource } from '@/src/lib/billing/roomMeterReadingSsot';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import type {
  PgElectricityOccupantPreview,
  PgElectricityTransferEvidencePreview,
} from '@/src/lib/billing/pgElectricityGenerationPreviewPure';
import { loadPgElectricityRoomGenerationPreview } from '@/src/lib/billing/pgElectricityGenerationPreview';
import type {
  PgElectricityAllocationPreview,
  PgElectricityMeterPeriodPreview,
  PgElectricitySettlementPreview,
} from '@/src/lib/billing/pgElectricityGenerationPreviewPure';
import { resolveElectricityGenerationMeterPeriod } from '@/src/lib/billing/resolveElectricityGenerationMeterPeriod';
import { resolveEffectiveBedCountForRoom } from '@/src/services/roomConfigurationSchedule';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';

export type { PgElectricityOccupantPreview };

export type PgElectricityRoomStatus =
  | 'already_billed'
  | 'reading_required'
  | 'previous_unavailable'
  | 'consumption_month_blocked'
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
  currentReadingUnits: number | null;
  unitsConsumed: number | null;
  ratePerUnitPaise: number;
  billId: string | null;
  billTotalPaise: number | null;
  activeBedCount: number;
  maintenanceBedCount: number;
  billableOccupantCount: number;
  previouslyCollectedPaise: number;
  occupantsPreview: PgElectricityOccupantPreview[];
  transferEvidencePreview: PgElectricityTransferEvidencePreview[];
  meterPeriodPreview: PgElectricityMeterPeriodPreview | null;
  allocationPreview: PgElectricityAllocationPreview | null;
  settlementPreview: PgElectricitySettlementPreview | null;
  /** When status is consumption_month_blocked — operator-facing reason. */
  blockedReason: string | null;
  requiredBaselineMonthLabel: string | null;
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
  /** Calendar date when the checklist was loaded (generation context for operators). */
  generationDateLabel: string;
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
 * Full PG room inventory checklist for one billing month.
 * Room under maintenance = every non-archived bed is maintenance (room-level effect).
 * One bed in maintenance does NOT exclude the room.
 */
export async function loadPgElectricityBillingChecklist(input: {
  pgId: string;
  billingMonth: string;
  /**
   * Full generation preview is required on the electricity generation checklist UI only.
   * Billing Centre fleet summaries must skip it (avoids meter-period throws + N+1).
   */
  includeGenerationPreview?: boolean;
}): Promise<PgElectricityBillingChecklist | null> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const includeGenerationPreview = input.includeGenerationPreview !== false;

  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(and(eq(pgs.id, input.pgId), sql`${pgs.archivedAt} IS NULL`))
    .limit(1);
  if (!pg) return null;

  const inventoryRooms = await listPgRoomsForElectricityBillingInventory(input.pgId);

  const checklistRooms: PgElectricityChecklistRoom[] = [];

  async function pushRoomWithPreview(
    base: Omit<
      PgElectricityChecklistRoom,
      | 'previouslyCollectedPaise'
      | 'occupantsPreview'
      | 'transferEvidencePreview'
      | 'meterPeriodPreview'
      | 'allocationPreview'
      | 'settlementPreview'
      | 'blockedReason'
      | 'requiredBaselineMonthLabel'
    > & {
      blockedReason?: string | null;
      requiredBaselineMonthLabel?: string | null;
    },
  ): Promise<void> {
    const skipPreview =
      !includeGenerationPreview ||
      base.status === 'already_billed' ||
      base.previousReadingUnits == null;

    if (skipPreview) {
      checklistRooms.push({
        ...base,
        blockedReason: base.blockedReason ?? null,
        requiredBaselineMonthLabel: base.requiredBaselineMonthLabel ?? null,
        previouslyCollectedPaise: 0,
        occupantsPreview: [],
        transferEvidencePreview: [],
        meterPeriodPreview: null,
        allocationPreview: null,
        settlementPreview: null,
      });
      return;
    }

    const previousReadingUnits = base.previousReadingUnits as number;
    const preview = await loadPgElectricityRoomGenerationPreview({
      roomId: base.roomId,
      billingMonth,
      previousReadingUnits,
      currentReadingUnits: base.currentReadingUnits,
      ratePerUnitPaise: base.ratePerUnitPaise,
    });

    checklistRooms.push({
      ...base,
      blockedReason: base.blockedReason ?? null,
      requiredBaselineMonthLabel: base.requiredBaselineMonthLabel ?? null,
      previouslyCollectedPaise: preview.previouslyCollectedPaise,
      occupantsPreview: preview.occupants,
      transferEvidencePreview: preview.transferEvidenceRows,
      meterPeriodPreview: preview.meterPeriod,
      allocationPreview: preview.allocationPreview,
      settlementPreview: preview.settlementPreview,
    });
  }

  for (const room of inventoryRooms) {
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
    const physicalActiveBedCount = Number(bedStats[0]?.active_beds ?? 0);
    const maintenanceBedCount = Number(bedStats[0]?.maintenance_beds ?? 0);
    const totalBeds = Number(bedStats[0]?.total_beds ?? 0);
    const activeBedCount = await resolveEffectiveBedCountForRoom(room.roomId, billingMonth);

    const [existingBill] = await db
      .select({
        id: electricityBills.id,
        totalPaise: electricityBills.totalPaise,
        previousReadingUnits: electricityBills.previousReadingUnits,
        currentReadingUnits: electricityBills.currentReadingUnits,
        unitsConsumed: electricityBills.unitsConsumed,
        ratePerUnitPaise: electricityBills.ratePerUnitPaise,
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
      await pushRoomWithPreview({
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        status: 'already_billed',
        previousReadingUnits: Number(existingBill.previousReadingUnits),
        previousReadingSource: 'last_monthly_bill',
        previousBillingMonthLabel: monthLabel(billingMonth),
        currentReadingUnits: Number(existingBill.currentReadingUnits),
        unitsConsumed: Number(existingBill.unitsConsumed),
        ratePerUnitPaise: existingBill.ratePerUnitPaise,
        billId: existingBill.id,
        billTotalPaise: existingBill.totalPaise,
        activeBedCount,
        maintenanceBedCount,
        billableOccupantCount: 0,
      });
      continue;
    }

    // Whole room under maintenance: has beds, but none available for electricity occupancy.
    if (totalBeds > 0 && physicalActiveBedCount === 0) {
      await pushRoomWithPreview({
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        status: 'maintenance_excluded',
        previousReadingUnits: null,
        previousReadingSource: null,
        previousBillingMonthLabel: null,
        currentReadingUnits: null,
        unitsConsumed: null,
        ratePerUnitPaise: DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
        billId: null,
        billTotalPaise: null,
        activeBedCount,
        maintenanceBedCount,
        billableOccupantCount: 0,
      });
      continue;
    }

    const continuity = await assessConsumptionMonthContinuityForRoom(room.roomId, billingMonth);
    if (!continuity.ok) {
      await pushRoomWithPreview({
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        status: 'consumption_month_blocked',
        previousReadingUnits: null,
        previousReadingSource: null,
        previousBillingMonthLabel: continuity.lastFinalizedMonth
          ? monthLabel(continuity.lastFinalizedMonth)
          : null,
        currentReadingUnits: null,
        unitsConsumed: null,
        ratePerUnitPaise: DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
        billId: null,
        billTotalPaise: null,
        activeBedCount,
        maintenanceBedCount,
        billableOccupantCount: 0,
        blockedReason: continuity.message,
        requiredBaselineMonthLabel: monthLabel(continuity.requiredBaselineMonth),
      });
      continue;
    }

    let baseline;
    try {
      baseline = await resolveRoomPreviousMeterReading(room.roomId, {
        beforeBillingMonth: billingMonth,
        enforceContinuity: true,
      });
    } catch (err) {
      if (err instanceof ConsumptionMonthContinuityError) {
        await pushRoomWithPreview({
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          status: 'consumption_month_blocked',
          previousReadingUnits: null,
          previousReadingSource: null,
          previousBillingMonthLabel: err.assessment.lastFinalizedMonth
            ? monthLabel(err.assessment.lastFinalizedMonth)
            : null,
          currentReadingUnits: null,
          unitsConsumed: null,
          ratePerUnitPaise: DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
          billId: null,
          billTotalPaise: null,
          activeBedCount,
          maintenanceBedCount,
          billableOccupantCount: 0,
          blockedReason: err.message,
          requiredBaselineMonthLabel: monthLabel(err.assessment.requiredBaselineMonth),
        });
        continue;
      }
      throw err;
    }

    if (baseline.source === 'none') {
      await pushRoomWithPreview({
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        status: 'previous_unavailable',
        previousReadingUnits: null,
        previousReadingSource: 'none',
        previousBillingMonthLabel: null,
        currentReadingUnits: null,
        unitsConsumed: null,
        ratePerUnitPaise: baseline.ratePerUnitPaise,
        billId: null,
        billTotalPaise: null,
        activeBedCount,
        maintenanceBedCount,
        billableOccupantCount: 0,
      });
      continue;
    }

    const meterPeriodResolved = await resolveElectricityGenerationMeterPeriod({
      roomId: room.roomId,
      reportingBillingMonth: billingMonth,
      previousReadingUnits: baseline.previousReadingUnits,
    });
    const periodEndExclusiveIso = formatDate(
      addDays(parseDate(meterPeriodResolved.periodEndDate), 1),
    );
    const occupantLoad = await loadRoomElectricityOccupantsForMonth({
      roomId: room.roomId,
      billingMonth,
      includeFixedStay: true,
      useProRataByActiveDays: true,
      meterPeriod: {
        startDate: meterPeriodResolved.periodStartDate,
        endDateExclusive: periodEndExclusiveIso,
        previousFinalizedReadingUnits: baseline.previousReadingUnits,
      },
    });
    const billableOccupantCount = occupantLoad.occupants.length;

    if (billableOccupantCount === 0) {
      await pushRoomWithPreview({
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        status: 'not_eligible',
        previousReadingUnits: baseline.previousReadingUnits,
        previousReadingSource: baseline.source,
        previousBillingMonthLabel: billingMonthLabel(baseline.lastBillingMonth),
        currentReadingUnits: null,
        unitsConsumed: null,
        ratePerUnitPaise: baseline.ratePerUnitPaise,
        billId: null,
        billTotalPaise: null,
        activeBedCount,
        maintenanceBedCount,
        billableOccupantCount,
      });
      continue;
    }

    await pushRoomWithPreview({
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      status: 'reading_required',
      previousReadingUnits: baseline.previousReadingUnits,
      previousReadingSource: baseline.source,
      previousBillingMonthLabel: billingMonthLabel(baseline.lastBillingMonth),
      currentReadingUnits: null,
      unitsConsumed: null,
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
      (r) =>
        r.status === 'previous_unavailable' ||
        r.status === 'needs_attention' ||
        r.status === 'consumption_month_blocked',
    ).length,
    hasAnyBillActivity: checklistRooms.some((r) => r.status === 'already_billed'),
  };

  return {
    billingMonth,
    monthLabel: monthLabel(billingMonth),
    generationDateLabel: new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    pgId: pg.id,
    pgName: pg.name,
    ratePerUnitPaise: DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
    rooms: checklistRooms,
    summary,
  };
}
