/**
 * Pure deposit rules — safe for client and server.
 * Monthly Stay: bed_prices monthly deposit when set; else 2 weeks rent (half of monthly rate).
 * Fixed-Date Stay: 50% of booking rent subtotal.
 */

import { coerceNonNegativePaise } from '@/src/lib/format';

export type DepositRateFields = {
  monthlyRatePaise: number;
  /** When set on bed_prices, inventory deposit drives monthly-stay quotes. */
  monthlySecurityDepositPaise?: number;
};

export function computeMonthlyDepositPaise(rate: DepositRateFields): number {
  const monthly = coerceNonNegativePaise(rate.monthlyRatePaise);
  if (!(monthly > 0)) {
    throw new Error('No positive monthly rate configured for deposit.');
  }
  const stored = coerceNonNegativePaise(rate.monthlySecurityDepositPaise ?? 0);
  if (stored > 0) return stored;
  return Math.ceil(monthly / 2);
}

export function computeFixedStayDepositPaise(subtotalPaise: number): number {
  if (subtotalPaise <= 0) return 0;
  return Math.ceil(subtotalPaise * 0.5);
}
