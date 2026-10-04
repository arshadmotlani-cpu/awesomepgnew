/**
 * Pure rules: which prior electricity collections belong to an open meter period.
 * Financial attribution follows consumption/checkout/settlement dates — not row created_at.
 */

export type CheckoutElectricityMeterEvidence = {
  previousReadingUnits: number | null;
  currentReadingUnits: number | null;
};

export type PriorCollectionAttributionInput = {
  periodStartDate: string;
  periodEndExclusive: string;
  /** Closing reading of the last finalized bill (open period opens after this). */
  previousFinalizedReadingUnits?: number | null;
  vacatingDate?: string | null;
  contributionDate?: string | null;
  stayPeriodStart?: string | null;
  stayPeriodEnd?: string | null;
  checkoutMeter?: CheckoutElectricityMeterEvidence | null;
};

export function dateInHalfOpenRange(date: string, start: string, endExclusive: string): boolean {
  const d = date.slice(0, 10);
  return d >= start.slice(0, 10) && d < endExclusive.slice(0, 10);
}

/** Authoritative economic date for checkout electricity (never created_at). */
export function resolvePriorCollectionAttributionDate(
  input: PriorCollectionAttributionInput,
): string | null {
  if (input.contributionDate) return input.contributionDate.slice(0, 10);
  if (input.vacatingDate) return String(input.vacatingDate).slice(0, 10);
  if (input.stayPeriodEnd) return String(input.stayPeriodEnd).slice(0, 10);
  if (input.stayPeriodStart) return String(input.stayPeriodStart).slice(0, 10);
  return null;
}

function stayIntervalOverlapsOpenPeriod(input: PriorCollectionAttributionInput): boolean {
  const periodStart = input.periodStartDate.slice(0, 10);
  const periodEndExclusive = input.periodEndExclusive.slice(0, 10);
  const stayStart = input.stayPeriodStart?.slice(0, 10) ?? null;
  const stayEnd = input.stayPeriodEnd?.slice(0, 10) ?? null;
  if (!stayStart && !stayEnd) return false;
  const intervalStart = stayStart ?? stayEnd!;
  const intervalEndExclusive = stayEnd
    ? formatDateExclusiveFromInclusiveEnd(stayEnd)
    : formatDateExclusiveFromInclusiveEnd(stayStart!);
  return intervalStart < periodEndExclusive && intervalEndExclusive > periodStart;
}

function formatDateExclusiveFromInclusiveEnd(inclusiveEnd: string): string {
  const d = new Date(`${inclusiveEnd.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Checkout meter readings entirely at or before the last finalized closing reading
 * cannot belong to the next open interval (e.g. 337→358 before 424 boundary).
 */
export function checkoutMeterBeforeOpenPeriodBoundary(input: {
  previousFinalizedReadingUnits: number | null | undefined;
  checkoutMeter: CheckoutElectricityMeterEvidence | null | undefined;
}): boolean {
  const boundary = input.previousFinalizedReadingUnits;
  const current = input.checkoutMeter?.currentReadingUnits;
  if (boundary == null || current == null || !Number.isFinite(current)) return false;
  return current <= boundary;
}

export function priorCollectionBelongsToOpenMeterPeriod(
  input: PriorCollectionAttributionInput,
): boolean {
  const periodStart = input.periodStartDate.slice(0, 10);
  const periodEndExclusive = input.periodEndExclusive.slice(0, 10);
  const attributionDate = resolvePriorCollectionAttributionDate(input);

  if (
    attributionDate &&
    attributionDate < periodStart &&
    checkoutMeterBeforeOpenPeriodBoundary({
      previousFinalizedReadingUnits: input.previousFinalizedReadingUnits,
      checkoutMeter: input.checkoutMeter,
    })
  ) {
    return false;
  }

  if (attributionDate && dateInHalfOpenRange(attributionDate, periodStart, periodEndExclusive)) {
    return true;
  }

  return stayIntervalOverlapsOpenPeriod(input);
}
