import { resolveMonthlyDepositPaise } from '@/src/lib/pricing/monthlyDepositPolicy';

/** Bed rate fields used for customer-facing deposit previews (no DB). */
export type CustomerBedRateFields = {
  monthlyRatePaise: number;
  dailyRatePaise?: number;
  weeklyRatePaise?: number;
  securityDepositPaise: number;
  dailySecurityDepositPaise?: number;
  weeklySecurityDepositPaise?: number;
  monthlySecurityDepositPaise?: number;
  /** Server-enriched monthly-stay reference deposit from quote engine. */
  quotedMonthlyDepositPaise?: number;
};

/** Label for pre-booking monthly-stay deposit reference on bed pages. */
export const MONTHLY_STAY_DEPOSIT_REFERENCE_LABEL = 'Reference deposit (monthly stay)';

/**
 * Monthly / open-ended deposit shown on bed maps and room pages.
 * Prefers server quote; falls back to one-month PG-default policy when only rates are present.
 */
export function displayMonthlyDepositPaise(bed: CustomerBedRateFields): number {
  if (typeof bed.quotedMonthlyDepositPaise === 'number' && bed.quotedMonthlyDepositPaise > 0) {
    return bed.quotedMonthlyDepositPaise;
  }
  if (bed.monthlyRatePaise > 0) {
    return resolveMonthlyDepositPaise({
      monthlyRatePaise: bed.monthlyRatePaise,
      bedMonthlySecurityDepositPaise: bed.monthlySecurityDepositPaise,
    });
  }
  return 0;
}
