/**
 * Room electricity identity = meter interval (opening → closing), not calendar month.
 * billing_month on electricity_bills is reporting / invoice labeling only.
 */
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { readingsMatch } from '@/src/lib/billing/roomMeterReadingSsot';

export type MeterPeriodBillRow = {
  id?: string;
  billingMonth: string;
  previousReadingUnits: number;
  currentReadingUnits: number;
  periodStartDate?: string | null;
  periodEndDate?: string | null;
  /** ISO timestamp or date — order bills by real-world finalize sequence. */
  createdAt?: string | null;
};

export function sortFinalizedBillsByAppliedOrder(
  bills: MeterPeriodBillRow[],
): MeterPeriodBillRow[] {
  return [...bills].sort((a, b) => {
    const ta = a.createdAt ?? `${a.billingMonth}T00:00:00.000Z`;
    const tb = b.createdAt ?? `${b.billingMonth}T00:00:00.000Z`;
    const byTime = ta.localeCompare(tb);
    if (byTime !== 0) return byTime;
    return a.billingMonth.localeCompare(b.billingMonth);
  });
}

export function lastFinalizedBill(
  bills: MeterPeriodBillRow[],
): MeterPeriodBillRow | null {
  const sorted = sortFinalizedBillsByAppliedOrder(bills);
  return sorted[sorted.length - 1] ?? null;
}

export function lastFinalizedClosingReading(bills: MeterPeriodBillRow[]): number | null {
  const last = lastFinalizedBill(bills);
  return last ? last.currentReadingUnits : null;
}

/** Opening reading for the next meter period — last finalized close, else 0. */
export function expectedOpeningReadingForNewBill(bills: MeterPeriodBillRow[]): number {
  return lastFinalizedClosingReading(bills) ?? 0;
}

/**
 * At checkout, attach collections to the finalized bill whose closing is the tail opening.
 * When multiple bills exist in one calendar month, pick the highest close ≤ checkout reading.
 */
export function pickFinalizedBillForCheckout(
  bills: MeterPeriodBillRow[],
  checkoutClosingUnits: number,
): MeterPeriodBillRow | null {
  const eligible = bills.filter(
    (b) =>
      b.currentReadingUnits <= checkoutClosingUnits &&
      b.currentReadingUnits > b.previousReadingUnits,
  );
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => b.currentReadingUnits - a.currentReadingUnits)[0]!;
}

export function meterIntervalIdentityKey(
  roomId: string,
  previousReadingUnits: number,
  currentReadingUnits: number,
): string {
  return `${roomId}:${previousReadingUnits}:${currentReadingUnits}`;
}

export function validateMeterPeriodOpening(input: {
  priorFinalizedBills: MeterPeriodBillRow[];
  providedOpeningUnits: number;
  allowOverride?: boolean;
}): { ok: true; expectedOpeningUnits: number } | { ok: false; message: string } {
  const expected = expectedOpeningReadingForNewBill(input.priorFinalizedBills);
  if (input.allowOverride) return { ok: true, expectedOpeningUnits: expected };
  if (readingsMatch(input.providedOpeningUnits, expected)) {
    return { ok: true, expectedOpeningUnits: expected };
  }
  return {
    ok: false,
    message:
      `Opening meter reading must be ${expected} (last finalized closing for this room). ` +
      `Got ${input.providedOpeningUnits}. Calendar month labels do not reset the meter chain.`,
  };
}

/** Cross-month gaps without a generated bill are normal — only meter continuity matters. */
export function assessMeterPeriodChainContinuity(
  priorFinalizedBills: MeterPeriodBillRow[],
): {
  ok: true;
  isFirstPeriod: boolean;
  expectedOpeningUnits: number;
  lastFinalizedBill: MeterPeriodBillRow | null;
} {
  const last = lastFinalizedBill(priorFinalizedBills);
  return {
    ok: true,
    isFirstPeriod: priorFinalizedBills.length === 0,
    expectedOpeningUnits: expectedOpeningReadingForNewBill(priorFinalizedBills),
    lastFinalizedBill: last,
  };
}

export function checkoutTailOpeningUnits(input: {
  finalizedBillClosingUnits: number | null;
  chainOpeningUnits: number | null;
  checkoutClosingUnits: number;
}): number | null {
  if (input.finalizedBillClosingUnits != null) {
    return input.finalizedBillClosingUnits;
  }
  if (input.chainOpeningUnits != null) return input.chainOpeningUnits;
  return null;
}

export function checkoutGrossUnits(input: {
  finalizedBill: Pick<MeterPeriodBillRow, 'previousReadingUnits' | 'currentReadingUnits'> | null;
  checkoutClosingUnits: number;
  tailOpeningUnits: number;
}): number {
  if (
    input.finalizedBill &&
    input.checkoutClosingUnits > input.finalizedBill.currentReadingUnits
  ) {
    return input.checkoutClosingUnits - input.finalizedBill.currentReadingUnits;
  }
  if (input.checkoutClosingUnits > input.tailOpeningUnits) {
    return input.checkoutClosingUnits - input.tailOpeningUnits;
  }
  return 0;
}

/** Guard: never rebill a finalized interval as part of checkout (337→479 when 337→424 exists). */
export function rejectsFullSpanCheckoutWhenFinalizedExists(input: {
  finalizedBill: Pick<MeterPeriodBillRow, 'previousReadingUnits' | 'currentReadingUnits'> | null;
  checkoutPreviousUnits: number | null;
  checkoutClosingUnits: number;
}): boolean {
  if (!input.finalizedBill) return false;
  const tailOpening = input.finalizedBill.currentReadingUnits;
  const wrongSpan =
    input.checkoutPreviousUnits != null &&
    readingsMatch(input.checkoutPreviousUnits, input.finalizedBill.previousReadingUnits) &&
    input.checkoutClosingUnits > input.finalizedBill.currentReadingUnits;
  const usesFinalizedOpenAsCheckoutOpen =
    input.checkoutPreviousUnits != null &&
    readingsMatch(input.checkoutPreviousUnits, input.finalizedBill.previousReadingUnits) &&
    !readingsMatch(input.checkoutPreviousUnits, tailOpening);
  return wrongSpan || usesFinalizedOpenAsCheckoutOpen;
}

/**
 * Half-open occupancy window for allocating unbilled tail gross across residents.
 * When vacating falls on the finalized bill period end, include the vacating day
 * (otherwise tail start = day-after-period-end equals vacating exclusive end → zero days).
 */
export function resolveTailOccupancyPeriod(input: {
  finalizedPeriodEndDate: string;
  vacatingDate: string;
}): { periodStart: string; periodEndExclusive: string } {
  const periodEndExclusive = formatDate(addDays(parseDate(input.vacatingDate), 1));
  let periodStart = formatDate(addDays(parseDate(input.finalizedPeriodEndDate), 1));
  if (periodStart >= periodEndExclusive) {
    periodStart =
      input.finalizedPeriodEndDate <= input.vacatingDate
        ? input.finalizedPeriodEndDate
        : input.vacatingDate;
  }
  return { periodStart, periodEndExclusive };
}
