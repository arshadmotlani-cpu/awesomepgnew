/**
 * Pure helpers for continuous room meter SSOT.
 * Room previous reading advances ONLY when an electricity bill is finalized.
 * Move-out settlements never contribute to this chain.
 */
import {
  expectedOpeningReadingForNewBill,
  lastFinalizedBill,
  type MeterPeriodBillRow,
} from '@/src/lib/billing/electricityMeterPeriodSsot';

export type RoomPreviousMeterSource =
  | 'last_monthly_bill'
  | 'last_monthly_meter_log'
  | 'none';

export type FinalizedBillReadingRow = {
  billingMonth: string;
  previousReadingUnits?: number;
  currentReadingUnits: number;
  ratePerUnitPaise?: number | null;
  meterImageUrl?: string | null;
  periodStartDate?: string | null;
  periodEndDate?: string | null;
  createdAt?: string | null;
};

function asMeterPeriodRows(bills: FinalizedBillReadingRow[]): MeterPeriodBillRow[] {
  return bills.map((b) => ({
    billingMonth: b.billingMonth,
    previousReadingUnits: b.previousReadingUnits ?? 0,
    currentReadingUnits: b.currentReadingUnits,
    periodStartDate: b.periodStartDate,
    periodEndDate: b.periodEndDate,
    createdAt: b.createdAt,
  }));
}

/**
 * Opening reading for the next bill — last finalized closing on the meter chain.
 */
export function pickPreviousMeterReadingFromFinalizedBills(
  bills: FinalizedBillReadingRow[],
  _beforeBillingMonth?: string,
): {
  previousReadingUnits: number;
  source: 'last_monthly_bill';
  lastBillingMonth: string;
  ratePerUnitPaise: number | null;
  meterImageUrl: string | null;
} | null {
  void _beforeBillingMonth;
  const last = lastFinalizedBill(asMeterPeriodRows(bills));
  if (!last) return null;
  const src = bills.find(
    (b) =>
      b.billingMonth === last.billingMonth && b.currentReadingUnits === last.currentReadingUnits,
  );
  return {
    previousReadingUnits: last.currentReadingUnits,
    source: 'last_monthly_bill',
    lastBillingMonth: last.billingMonth,
    ratePerUnitPaise: src?.ratePerUnitPaise ?? null,
    meterImageUrl: src?.meterImageUrl ?? null,
  };
}

export function expectedOpeningFromFinalizedBills(bills: FinalizedBillReadingRow[]): number {
  return expectedOpeningReadingForNewBill(asMeterPeriodRows(bills));
}

export function readingsMatch(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.round(a * 100) === Math.round(b * 100);
}

export function validateContinuousPreviousReading(input: {
  providedPreviousUnits: number;
  expectedPreviousUnits: number;
  allowOverride?: boolean;
}): { ok: true } | { ok: false; message: string } {
  if (input.allowOverride) return { ok: true };
  if (readingsMatch(input.providedPreviousUnits, input.expectedPreviousUnits)) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      `Previous meter reading must be ${input.expectedPreviousUnits} ` +
      `(last finalized closing reading for this room). ` +
      `Got ${input.providedPreviousUnits}. ` +
      `Move-out settlements do not change the room previous reading.`,
  };
}
