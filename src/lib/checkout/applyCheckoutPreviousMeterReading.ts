import type { CheckoutSettlement } from '@/src/db/schema';
import type { ResolvedCheckoutPreviousMeterReading } from '@/src/lib/checkout/checkoutPreviousMeterReading';
import type { RoomPreviousMeterSource } from '@/src/lib/billing/roomMeterReadingSsot';

export type CheckoutPreviousMeterReadingPresentation = {
  electricityPreviousReading: string | null;
  electricityPreviousReadingAuto: boolean;
  electricityPreviousReadingAvailable: boolean;
  electricityPreviousReadingSource: RoomPreviousMeterSource | null;
  electricityPreviousReadingSourceLabel: string | null;
  electricityUnitRatePaise: number | null;
};

/**
 * Merge SSOT previous reading into settlement detail when DB has no saved value.
 * Never overwrites an admin-saved previous reading.
 */
export function applyCheckoutPreviousMeterReadingPresentation(
  settlement: CheckoutSettlement,
  baseline: ResolvedCheckoutPreviousMeterReading | null,
): CheckoutPreviousMeterReadingPresentation {
  const savedPrevious = settlement.electricityPreviousReading?.trim() || null;

  if (savedPrevious) {
    return {
      electricityPreviousReading: savedPrevious,
      electricityPreviousReadingAuto: false,
      electricityPreviousReadingAvailable: true,
      electricityPreviousReadingSource: null,
      electricityPreviousReadingSourceLabel: null,
      electricityUnitRatePaise: settlement.electricityUnitRatePaise,
    };
  }

  if (!baseline?.available || baseline.previousReadingUnits == null) {
    return {
      electricityPreviousReading: null,
      electricityPreviousReadingAuto: false,
      electricityPreviousReadingAvailable: false,
      electricityPreviousReadingSource: baseline?.source ?? 'none',
      electricityPreviousReadingSourceLabel: baseline?.sourceLabel ?? null,
      electricityUnitRatePaise:
        settlement.electricityUnitRatePaise ?? baseline?.ratePerUnitPaise ?? null,
    };
  }

  return {
    electricityPreviousReading: String(baseline.previousReadingUnits),
    electricityPreviousReadingAuto: true,
    electricityPreviousReadingAvailable: true,
    electricityPreviousReadingSource: baseline.source,
    electricityPreviousReadingSourceLabel: baseline.sourceLabel,
    electricityUnitRatePaise:
      settlement.electricityUnitRatePaise ?? baseline.ratePerUnitPaise,
  };
}
