/**
 * Monthly deposit policy inheritance: PG → room → bed (bed via bed_prices).
 */

import type { MonthlyDepositPolicy } from '@/src/db/schema/enums';
import { coerceNonNegativePaise } from '@/src/lib/format';

export type MonthlyDepositContext = {
  monthlyRatePaise: number;
  pgPolicy?: MonthlyDepositPolicy | null;
  roomPolicy?: MonthlyDepositPolicy | null;
  /** Explicit bed_prices.monthly_security_deposit_paise when set. */
  bedMonthlySecurityDepositPaise?: number | null;
};

export function resolveMonthlyDepositPolicy(
  ctx: Pick<MonthlyDepositContext, 'pgPolicy' | 'roomPolicy'>,
): MonthlyDepositPolicy {
  return ctx.roomPolicy ?? ctx.pgPolicy ?? 'one_month';
}

export function monthlyDepositMultiplier(policy: MonthlyDepositPolicy): number {
  return policy === 'two_month' ? 2 : 1;
}

/** Resolve monthly deposit paise at quote time with PG → room → bed inheritance. */
export function resolveMonthlyDepositPaise(ctx: MonthlyDepositContext): number {
  const monthly = coerceNonNegativePaise(ctx.monthlyRatePaise);
  if (!(monthly > 0)) {
    throw new Error('No positive monthly rate configured for deposit.');
  }
  const stored = coerceNonNegativePaise(ctx.bedMonthlySecurityDepositPaise ?? 0);
  if (stored > 0) return stored;
  const policy = resolveMonthlyDepositPolicy(ctx);
  return monthly * monthlyDepositMultiplier(policy);
}
