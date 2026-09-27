/**
 * Continuous room meter SSOT — previous reading for the next electricity bill.
 *
 * Meter interval continuity: baseline is the last finalized closing reading on
 * the room chain (by applied order). Calendar billing_month gaps are normal.
 *
 * Checkout / check-in meter logs and move-out settlements NEVER advance this.
 */

import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBills, meterLogs } from '@/src/db/schema';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import {
  assessMeterPeriodChainContinuity,
  type MeterPeriodBillRow,
} from '@/src/lib/billing/electricityMeterPeriodSsot';
import type { ConsumptionMonthContinuityAssessment } from '@/src/lib/billing/consumptionMonthContinuity';
import type { FinalizedBillReadingRow, RoomPreviousMeterSource } from '@/src/lib/billing/roomMeterReadingSsot';
import { firstOfMonth } from '@/src/services/billing';

export type { ConsumptionMonthContinuityAssessment };

export class ConsumptionMonthContinuityError extends Error {
  constructor(
    message: string,
    readonly assessment: ConsumptionMonthContinuityAssessment & { ok: false },
  ) {
    super(message);
    this.name = 'ConsumptionMonthContinuityError';
  }
}

export type ResolvedRoomPreviousMeterReading = {
  previousReadingUnits: number;
  source: RoomPreviousMeterSource;
  lastBillingMonth: string | null;
  ratePerUnitPaise: number;
  lastBillMeterImageUrl: string | null;
  continuity: ConsumptionMonthContinuityAssessment;
};

function mapBillRow(row: {
  billingMonth: string;
  previousReadingUnits: string;
  currentReadingUnits: string;
  ratePerUnitPaise: number;
  meterImageUrl: string | null;
  periodStartDate: string | null;
  periodEndDate: string | null;
  createdAt: Date;
}): FinalizedBillReadingRow {
  return {
    billingMonth: row.billingMonth,
    previousReadingUnits: Number(row.previousReadingUnits),
    currentReadingUnits: Number(row.currentReadingUnits),
    ratePerUnitPaise: row.ratePerUnitPaise,
    meterImageUrl: row.meterImageUrl,
    periodStartDate: row.periodStartDate,
    periodEndDate: row.periodEndDate,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function loadFinalizedElectricityBillsForRoom(
  roomId: string,
): Promise<FinalizedBillReadingRow[]> {
  const rows = await db
    .select({
      billingMonth: electricityBills.billingMonth,
      previousReadingUnits: electricityBills.previousReadingUnits,
      currentReadingUnits: electricityBills.currentReadingUnits,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
      meterImageUrl: electricityBills.meterImageUrl,
      periodStartDate: electricityBills.periodStartDate,
      periodEndDate: electricityBills.periodEndDate,
      createdAt: electricityBills.createdAt,
    })
    .from(electricityBills)
    .where(and(eq(electricityBills.roomId, roomId), eq(electricityBills.isPipelineTest, false)))
    .orderBy(asc(electricityBills.createdAt));

  return rows.map(mapBillRow);
}

function toMeterPeriodRows(bills: FinalizedBillReadingRow[]): MeterPeriodBillRow[] {
  return bills.map((b) => ({
    billingMonth: b.billingMonth,
    previousReadingUnits: b.previousReadingUnits ?? 0,
    currentReadingUnits: b.currentReadingUnits,
    periodStartDate: b.periodStartDate,
    periodEndDate: b.periodEndDate,
    createdAt: b.createdAt,
  }));
}

function continuityAssessmentFromChain(
  chain: ReturnType<typeof assessMeterPeriodChainContinuity>,
): ConsumptionMonthContinuityAssessment {
  return {
    ok: true,
    isFirstConsumptionMonth: chain.isFirstPeriod,
    requiredBaselineMonth: chain.lastFinalizedBill?.billingMonth ?? null,
  };
}

/** @deprecated Calendar-month gap checks removed — returns meter-chain assessment (always ok). */
export async function assessConsumptionMonthContinuityForRoom(
  roomId: string,
  targetBillingMonth: string,
): Promise<ConsumptionMonthContinuityAssessment> {
  void firstOfMonth(targetBillingMonth);
  const bills = await loadFinalizedElectricityBillsForRoom(roomId);
  const chain = assessMeterPeriodChainContinuity(toMeterPeriodRows(bills));
  return continuityAssessmentFromChain(chain);
}

export async function resolveRoomPreviousMeterReading(
  roomId: string,
  options: { beforeBillingMonth: string; enforceContinuity?: boolean },
): Promise<ResolvedRoomPreviousMeterReading> {
  void firstOfMonth(options.beforeBillingMonth);
  const allBills = await loadFinalizedElectricityBillsForRoom(roomId);
  const chain = assessMeterPeriodChainContinuity(toMeterPeriodRows(allBills));
  const continuity = continuityAssessmentFromChain(chain);

  if (chain.lastFinalizedBill) {
    const last = chain.lastFinalizedBill;
    const row = allBills.find(
      (b) =>
        b.billingMonth === last.billingMonth &&
        b.currentReadingUnits === last.currentReadingUnits,
    );
    return {
      previousReadingUnits: last.currentReadingUnits,
      source: 'last_monthly_bill',
      lastBillingMonth: last.billingMonth,
      ratePerUnitPaise: row?.ratePerUnitPaise ?? DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
      lastBillMeterImageUrl: row?.meterImageUrl ?? null,
      continuity,
    };
  }

  const [lastMonthlyLog] = await db
    .select({ units: meterLogs.units })
    .from(meterLogs)
    .where(and(eq(meterLogs.roomId, roomId), eq(meterLogs.readingType, 'monthly')))
    .orderBy(desc(meterLogs.recordedAt))
    .limit(1);

  if (lastMonthlyLog?.units != null) {
    return {
      previousReadingUnits: Number(lastMonthlyLog.units),
      source: 'last_monthly_meter_log',
      lastBillingMonth: null,
      ratePerUnitPaise: DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
      lastBillMeterImageUrl: null,
      continuity,
    };
  }

  return {
    previousReadingUnits: 0,
    source: 'none',
    lastBillingMonth: null,
    ratePerUnitPaise: DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
    lastBillMeterImageUrl: null,
    continuity,
  };
}
