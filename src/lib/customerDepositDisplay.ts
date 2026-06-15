/** Bed rate fields used for customer-facing deposit previews (no DB). */
export type CustomerBedRateFields = {
  monthlyRatePaise: number;
  securityDepositPaise: number;
  dailySecurityDepositPaise?: number;
  weeklySecurityDepositPaise?: number;
  monthlySecurityDepositPaise?: number;
};

/**
 * Monthly / open-ended deposit shown on bed maps and room pages.
 * Matches checkout: 2 × monthly rent when a monthly rate exists.
 */
export function displayMonthlyDepositPaise(bed: CustomerBedRateFields): number {
  if (bed.monthlyRatePaise > 0) {
    return bed.monthlyRatePaise * 2;
  }
  return bed.monthlySecurityDepositPaise ?? bed.securityDepositPaise ?? 0;
}
