/**
 * Late fee policy engine — replaces hardcoded 1%/day when an active policy exists.
 * Money math stays pure; resolveActivePolicy is the only DB touchpoint.
 *
 * Fallback (no policy): floor(principal * overdueDays / 100) — identical to legacy computeLateFee.
 */

import { and, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { lateFeePolicies, type LateFeePolicy } from '@/src/db/schema';
import { addDays, diffDays, formatDate, parseDate, type DateLike } from '@/src/lib/dates';

function asOfIso(value?: DateLike): string {
  return formatDate(parseDate(value ?? new Date()));
}
export type LateFeePolicySnapshot = {
  id?: string;
  type: 'fixed_per_day' | 'percent_of_principal';
  amountPaise: number | null;
  percentBps: number | null;
  graceDays: number;
  maxFeePaise: number | null;
  appliesTo: 'rent' | 'electricity' | 'both';
};

/** Default seed policy: 1%/day (100 bps), grace 0, no cap. */
export const DEFAULT_LATE_FEE_POLICY: LateFeePolicySnapshot = {
  type: 'percent_of_principal',
  amountPaise: null,
  percentBps: 100,
  graceDays: 0,
  maxFeePaise: null,
  appliesTo: 'both',
};

export function toLateFeePolicySnapshot(row: LateFeePolicy): LateFeePolicySnapshot {
  return {
    id: row.id,
    type: row.type,
    amountPaise: row.amountPaise,
    percentBps: row.percentBps,
    graceDays: row.graceDays,
    maxFeePaise: row.maxFeePaise,
    appliesTo: row.appliesTo,
  };
}

/**
 * Days past due date (0 on due date). When only billingMonth is given,
 * uses legacy due-on-5th (billing_month day 5) to match billing.dueDateForMonth.
 */
export function resolveOverdueDays(args: {
  dueDate?: DateLike | null;
  billingMonth?: DateLike | null;
  today?: DateLike;
}): number {
  const today = args.today != null ? asOfIso(args.today) : formatDate(new Date());
  if (args.dueDate != null) {
    return Math.max(0, diffDays(args.dueDate, today));
  }
  if (args.billingMonth != null) {
    const start = parseDate(args.billingMonth);
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth();
    const due = new Date(Date.UTC(year, month, 5));
    return Math.max(0, diffDays(due, today));
  }
  return 0;
}

export function chargeableOverdueDays(overdueDays: number, graceDays: number): number {
  return Math.max(0, overdueDays - Math.max(0, graceDays));
}

/**
 * Pure policy application given already-computed overdue days.
 * percent_bps: 100 = 1% of principal per chargeable day.
 */
export function applyLateFeePolicy(args: {
  principalPaise: number;
  overdueDays: number;
  policy: LateFeePolicySnapshot;
}): number {
  if (args.principalPaise <= 0) return 0;
  const days = chargeableOverdueDays(args.overdueDays, args.policy.graceDays);
  if (days === 0) return 0;

  let fee = 0;
  if (args.policy.type === 'fixed_per_day') {
    fee = Math.floor((args.policy.amountPaise ?? 0) * days);
  } else {
    const bps = args.policy.percentBps ?? 100;
    fee = Math.floor((args.principalPaise * days * bps) / 10_000);
  }

  if (args.policy.maxFeePaise != null && args.policy.maxFeePaise >= 0) {
    fee = Math.min(fee, args.policy.maxFeePaise);
  }
  return Math.max(0, fee);
}

/** Legacy fallback: 1% of principal per overdue day, floored. */
export function legacyLateFeePaise(principalPaise: number, overdueDays: number): number {
  if (principalPaise <= 0 || overdueDays <= 0) return 0;
  return Math.floor((principalPaise * overdueDays) / 100);
}

/**
 * Compute late fee with an optional resolved policy.
 * When policy is null/undefined, preserves current 1%/day behavior.
 */
export function computeLateFeeWithPolicy(args: {
  principalPaise: number;
  dueDate?: DateLike | null;
  billingMonth?: DateLike | null;
  today?: DateLike;
  policy?: LateFeePolicySnapshot | null;
  /** When set, skip policies that don't apply to this charge kind. */
  chargeKind?: 'rent' | 'electricity';
}): number {
  const overdue = resolveOverdueDays({
    dueDate: args.dueDate,
    billingMonth: args.billingMonth,
    today: args.today,
  });

  const policy = args.policy;
  if (!policy) {
    return legacyLateFeePaise(args.principalPaise, overdue);
  }

  if (args.chargeKind) {
    if (policy.appliesTo !== 'both' && policy.appliesTo !== args.chargeKind) {
      return legacyLateFeePaise(args.principalPaise, overdue);
    }
  }

  return applyLateFeePolicy({
    principalPaise: args.principalPaise,
    overdueDays: overdue,
    policy,
  });
}

/**
 * Resolve the most specific active policy for a PG:
 * PG-scoped wins over global; newest effective_from ≤ asOf wins.
 */
export async function resolveActivePolicy(
  pgId: string | null | undefined,
  opts?: { asOf?: DateLike; chargeKind?: 'rent' | 'electricity' },
): Promise<LateFeePolicySnapshot | null> {
  const asOf = asOfIso(opts?.asOf);

  const rows = await db
    .select()
    .from(lateFeePolicies)
    .where(
      and(
        eq(lateFeePolicies.active, true),
        lte(lateFeePolicies.effectiveFrom, asOf),
        pgId
          ? or(eq(lateFeePolicies.pgId, pgId), isNull(lateFeePolicies.pgId))
          : isNull(lateFeePolicies.pgId),
      ),
    )
    .orderBy(
      // Prefer PG-specific (pg_id NOT NULL) then newest effective_from
      sql`CASE WHEN ${lateFeePolicies.pgId} IS NULL THEN 1 ELSE 0 END`,
      desc(lateFeePolicies.effectiveFrom),
    )
    .limit(8);

  for (const row of rows) {
    const snap = toLateFeePolicySnapshot(row);
    if (opts?.chargeKind) {
      if (snap.appliesTo !== 'both' && snap.appliesTo !== opts.chargeKind) continue;
    }
    return snap;
  }
  return null;
}

/** Convenience: resolve policy then compute (for async call sites). */
export async function computeLateFeeForPg(args: {
  principalPaise: number;
  pgId?: string | null;
  dueDate?: DateLike | null;
  billingMonth?: DateLike | null;
  today?: DateLike;
  chargeKind?: 'rent' | 'electricity';
}): Promise<number> {
  const policy = await resolveActivePolicy(args.pgId, {
    asOf: args.today,
    chargeKind: args.chargeKind,
  });
  return computeLateFeeWithPolicy({
    principalPaise: args.principalPaise,
    dueDate: args.dueDate,
    billingMonth: args.billingMonth,
    today: args.today,
    policy,
    chargeKind: args.chargeKind,
  });
}

/** Sum of recorded waivers for a rent invoice (paise). */
export async function sumLateFeeWaivers(rentInvoiceId: string): Promise<number> {
  const { lateFeeWaivers } = await import('@/src/db/schema');
  const rows = await db
    .select({ amountPaise: lateFeeWaivers.amountPaise })
    .from(lateFeeWaivers)
    .where(eq(lateFeeWaivers.rentInvoiceId, rentInvoiceId));
  return rows.reduce((sum, r) => sum + Math.max(0, r.amountPaise), 0);
}

/** Record a late-fee waiver (requires caller to check collections:waive). */
export async function recordLateFeeWaiver(input: {
  rentInvoiceId: string;
  amountPaise: number;
  reason: string;
  actorAdminId: string;
}): Promise<{ id: string }> {
  if (input.amountPaise <= 0) throw new Error('Waiver amount must be positive');
  if (!input.reason.trim()) throw new Error('Waiver reason required');
  const { lateFeeWaivers } = await import('@/src/db/schema');
  const [row] = await db
    .insert(lateFeeWaivers)
    .values({
      rentInvoiceId: input.rentInvoiceId,
      amountPaise: input.amountPaise,
      reason: input.reason.trim(),
      actorAdminId: input.actorAdminId,
    })
    .returning({ id: lateFeeWaivers.id });
  if (!row) throw new Error('Failed to record late fee waiver');
  return row;
}

/** Anchor helper for tests / reminder engine — not late-fee specific. */
export function addCalendarDaysIso(isoDate: string, days: number): string {
  return formatDate(addDays(isoDate, days));
}
