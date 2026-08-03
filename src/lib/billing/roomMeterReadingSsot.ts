/**
 * Pure helpers for continuous room meter SSOT.
 * Room previous reading advances ONLY when a monthly electricity bill is finalized.
 * Move-out settlements never contribute to this chain.
 */

export type RoomPreviousMeterSource =
  | 'last_monthly_bill'
  | 'last_monthly_meter_log'
  | 'none';

export type FinalizedBillReadingRow = {
  billingMonth: string;
  currentReadingUnits: number;
  ratePerUnitPaise?: number | null;
  meterImageUrl?: string | null;
};

/**
 * Pick the opening meter reading for a target billing month from finalized bills.
 * Uses the latest bill strictly before `beforeBillingMonth`.
 */
export function pickPreviousMeterReadingFromFinalizedBills(
  bills: FinalizedBillReadingRow[],
  beforeBillingMonth: string,
): {
  previousReadingUnits: number;
  source: 'last_monthly_bill';
  lastBillingMonth: string;
  ratePerUnitPaise: number | null;
  meterImageUrl: string | null;
} | null {
  const eligible = bills.filter((bill) => bill.billingMonth < beforeBillingMonth);
  if (eligible.length === 0) return null;

  const lastBill = [...eligible].sort((a, b) => b.billingMonth.localeCompare(a.billingMonth))[0]!;
  return {
    previousReadingUnits: lastBill.currentReadingUnits,
    source: 'last_monthly_bill',
    lastBillingMonth: lastBill.billingMonth,
    ratePerUnitPaise: lastBill.ratePerUnitPaise ?? null,
    meterImageUrl: lastBill.meterImageUrl ?? null,
  };
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
      `(last finalized monthly reading for this room). ` +
      `Got ${input.providedPreviousUnits}. ` +
      `Move-out settlements do not change the room previous reading.`,
  };
}
