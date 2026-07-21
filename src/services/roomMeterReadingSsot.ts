/**
 * Continuous room meter SSOT — previous reading for the next monthly bill.
 *
 * Source of truth (in order):
 * 1. Latest non–pipeline-test electricity_bills.current_reading_units
 * 2. Else latest meter_logs with reading_type = 'monthly' (bootstrap only)
 * 3. Else 0
 *
 * Checkout / check-in meter logs and move-out settlements NEVER advance this.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBills, meterLogs } from '@/src/db/schema';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import type { RoomPreviousMeterSource } from '@/src/lib/billing/roomMeterReadingSsot';

export type ResolvedRoomPreviousMeterReading = {
  previousReadingUnits: number;
  source: RoomPreviousMeterSource;
  lastBillingMonth: string | null;
  ratePerUnitPaise: number;
  lastBillMeterImageUrl: string | null;
};

export async function resolveRoomPreviousMeterReading(
  roomId: string,
): Promise<ResolvedRoomPreviousMeterReading> {
  const [lastBill] = await db
    .select({
      currentReadingUnits: electricityBills.currentReadingUnits,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
      billingMonth: electricityBills.billingMonth,
      meterImageUrl: electricityBills.meterImageUrl,
    })
    .from(electricityBills)
    .where(
      and(eq(electricityBills.roomId, roomId), eq(electricityBills.isPipelineTest, false)),
    )
    .orderBy(desc(electricityBills.billingMonth))
    .limit(1);

  if (lastBill?.currentReadingUnits != null) {
    return {
      previousReadingUnits: Number(lastBill.currentReadingUnits),
      source: 'last_monthly_bill',
      lastBillingMonth: lastBill.billingMonth,
      ratePerUnitPaise: lastBill.ratePerUnitPaise ?? DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
      lastBillMeterImageUrl: lastBill.meterImageUrl ?? null,
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
    };
  }

  return {
    previousReadingUnits: 0,
    source: 'none',
    lastBillingMonth: null,
    ratePerUnitPaise: DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE,
    lastBillMeterImageUrl: null,
  };
}
