/**
 * Continuous room meter SSOT — previous reading for the next monthly bill.
 *
 * Consumption-month continuity: baseline must be the close reading of the
 * immediately preceding consumption month (not an older bill when a gap exists).
 *
 * Checkout / check-in meter logs and move-out settlements NEVER advance this.
 */

import { and, asc, desc, eq, lt } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBills, meterLogs } from '@/src/db/schema';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import {
  assessConsumptionMonthContinuity,
  type ConsumptionMonthContinuityAssessment,
} from '@/src/lib/billing/consumptionMonthContinuity';
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

async function loadFinalizedBillsBeforeMonth(
  roomId: string,
  beforeBillingMonth: string,
): Promise<FinalizedBillReadingRow[]> {
  const rows = await db
    .select({
      billingMonth: electricityBills.billingMonth,
      currentReadingUnits: electricityBills.currentReadingUnits,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
      meterImageUrl: electricityBills.meterImageUrl,
    })
    .from(electricityBills)
    .where(
      and(
        eq(electricityBills.roomId, roomId),
        eq(electricityBills.isPipelineTest, false),
        lt(electricityBills.billingMonth, beforeBillingMonth),
      ),
    )
    .orderBy(asc(electricityBills.billingMonth));

  return rows.map((row) => ({
    billingMonth: row.billingMonth,
    currentReadingUnits: Number(row.currentReadingUnits),
    ratePerUnitPaise: row.ratePerUnitPaise,
    meterImageUrl: row.meterImageUrl,
  }));
}

export async function assessConsumptionMonthContinuityForRoom(
  roomId: string,
  targetBillingMonth: string,
): Promise<ConsumptionMonthContinuityAssessment> {
  const target = firstOfMonth(targetBillingMonth);
  const bills = await loadFinalizedBillsBeforeMonth(roomId, target);
  return assessConsumptionMonthContinuity(bills, target);
}

export async function resolveRoomPreviousMeterReading(
  roomId: string,
  options: { beforeBillingMonth: string; enforceContinuity?: boolean },
): Promise<ResolvedRoomPreviousMeterReading> {
  const beforeBillingMonth = firstOfMonth(options.beforeBillingMonth);
  const enforceContinuity = options.enforceContinuity !== false;
  const priorBills = await loadFinalizedBillsBeforeMonth(roomId, beforeBillingMonth);
  const continuity = assessConsumptionMonthContinuity(priorBills, beforeBillingMonth);

  if (!continuity.ok && enforceContinuity) {
    throw new ConsumptionMonthContinuityError(continuity.message, continuity);
  }

  if (continuity.ok && !continuity.isFirstConsumptionMonth && continuity.requiredBaselineMonth) {
    const baselineBill = priorBills.find(
      (bill) => bill.billingMonth === continuity.requiredBaselineMonth,
    );
    if (baselineBill) {
      return {
        previousReadingUnits: baselineBill.currentReadingUnits,
        source: 'last_monthly_bill',
        lastBillingMonth: baselineBill.billingMonth,
        ratePerUnitPaise:
          baselineBill.ratePerUnitPaise ?? DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
        lastBillMeterImageUrl: baselineBill.meterImageUrl ?? null,
        continuity,
      };
    }
  }

  if (priorBills.length > 0) {
    const lastBill = [...priorBills].sort((a, b) => b.billingMonth.localeCompare(a.billingMonth))[0]!;
    return {
      previousReadingUnits: lastBill.currentReadingUnits,
      source: 'last_monthly_bill',
      lastBillingMonth: lastBill.billingMonth,
      ratePerUnitPaise: lastBill.ratePerUnitPaise ?? DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
      lastBillMeterImageUrl: lastBill.meterImageUrl ?? null,
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
