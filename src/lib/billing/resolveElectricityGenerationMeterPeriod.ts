/**
 * Authoritative consumption interval for electricity bill generation.
 * Financial boundary = meter readings; billing_month is reporting only.
 */
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { lastFinalizedBill } from '@/src/lib/billing/electricityMeterPeriodSsot';
import type { FinalizedBillReadingRow } from '@/src/lib/billing/roomMeterReadingSsot';
import { calendarDaysBetween } from '@/src/lib/billing/roomElectricityOccupancyCoverage';
import { firstOfMonth, monthBounds } from '@/src/services/billing';
import { loadFinalizedElectricityBillsForRoom } from '@/src/services/roomMeterReadingSsot';

export type ResolvedElectricityGenerationMeterPeriod = {
  reportingBillingMonth: string;
  previousReadingUnits: number;
  periodStartDate: string;
  /** Inclusive date of the closing meter reading. */
  periodEndDate: string;
  periodEndExclusive: string;
  billingDays: string[];
  lastFinalizedBill: FinalizedBillReadingRow | null;
};

function inferFinalizedPeriodEndDate(bill: FinalizedBillReadingRow): string {
  if (bill.periodEndDate) return bill.periodEndDate.slice(0, 10);
  if (bill.createdAt) return bill.createdAt.slice(0, 10);
  const { end } = monthBounds(bill.billingMonth);
  return formatDate(addDays(parseDate(formatDate(end)), -1));
}

/** First calendar day of consumption after the last finalized bill (or reporting month start). */
export function resolveOpenMeterPeriodStartDate(input: {
  lastFinalizedBill: FinalizedBillReadingRow | null;
  reportingBillingMonth: string;
}): string {
  if (!input.lastFinalizedBill) {
    return formatDate(monthBounds(input.reportingBillingMonth).start);
  }
  return formatDate(addDays(parseDate(inferFinalizedPeriodEndDate(input.lastFinalizedBill)), 1));
}

export function resolveElectricityGenerationMeterPeriodFromBills(input: {
  reportingBillingMonth: string;
  previousReadingUnits: number;
  /** Inclusive date when the closing reading is recorded (defaults to today). */
  readingDate?: string;
  finalizedBills: FinalizedBillReadingRow[];
}): ResolvedElectricityGenerationMeterPeriod {
  const reportingBillingMonth = firstOfMonth(input.reportingBillingMonth);
  const last = lastFinalizedBill(
    input.finalizedBills.map((b) => ({
      billingMonth: b.billingMonth,
      previousReadingUnits: b.previousReadingUnits ?? 0,
      currentReadingUnits: b.currentReadingUnits,
      periodStartDate: b.periodStartDate,
      periodEndDate: b.periodEndDate,
      createdAt: b.createdAt,
    })),
  );
  const lastRow =
    last &&
    input.finalizedBills.find(
      (b) =>
        b.billingMonth === last.billingMonth &&
        b.currentReadingUnits === last.currentReadingUnits,
    );

  const periodStartDate = resolveOpenMeterPeriodStartDate({
    lastFinalizedBill: lastRow ?? null,
    reportingBillingMonth,
  });
  const periodEndDate = (input.readingDate ?? formatDate(new Date())).slice(0, 10);
  const periodEndExclusive = formatDate(addDays(parseDate(periodEndDate), 1));

  if (periodStartDate > periodEndDate) {
    throw new Error(
      `Meter period start ${periodStartDate} is after reading date ${periodEndDate}. ` +
        'Check last finalized bill period dates.',
    );
  }

  return {
    reportingBillingMonth,
    previousReadingUnits: input.previousReadingUnits,
    periodStartDate,
    periodEndDate,
    periodEndExclusive,
    billingDays: calendarDaysBetween(periodStartDate, periodEndExclusive),
    lastFinalizedBill: lastRow ?? null,
  };
}

export async function resolveElectricityGenerationMeterPeriod(input: {
  roomId: string;
  reportingBillingMonth: string;
  previousReadingUnits: number;
  readingDate?: string;
}): Promise<ResolvedElectricityGenerationMeterPeriod> {
  const finalizedBills = await loadFinalizedElectricityBillsForRoom(input.roomId);
  return resolveElectricityGenerationMeterPeriodFromBills({
    reportingBillingMonth: input.reportingBillingMonth,
    previousReadingUnits: input.previousReadingUnits,
    readingDate: input.readingDate,
    finalizedBills,
  });
}
