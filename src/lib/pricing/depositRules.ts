/**
 * Pure deposit rules — safe for client and server.
 * Monthly Stay: 2 weeks rent (half of monthly rate).
 * Fixed-Date Stay: 50% of booking rent subtotal.
 */

import { coerceNonNegativePaise } from '@/src/lib/format';

export type DepositRateFields = {
  monthlyRatePaise: number;
};

export function computeMonthlyDepositPaise(rate: DepositRateFields): number {
  const monthly = coerceNonNegativePaise(rate.monthlyRatePaise);
  if (!(monthly > 0)) {
    throw new Error('No positive monthly rate configured for deposit.');
  }
  return Math.ceil(monthly / 2);
}

export function computeFixedStayDepositPaise(subtotalPaise: number): number {
  if (subtotalPaise <= 0) return 0;
  return Math.ceil(subtotalPaise * 0.5);
}
