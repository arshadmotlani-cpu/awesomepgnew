/**
 * Late fee policy engine — replaces hardcoded 1%/day when an active policy exists.
 * Money math stays pure in `lateFeePolicyCore`; resolveActivePolicy is the only DB touchpoint.
 *
 * Fallback (no policy): floor(principal * overdueDays / 100) — identical to legacy computeLateFee.
 */

import { and, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { lateFeePolicies, type LateFeePolicy } from '@/src/db/schema';
import { formatDate, parseDate, type DateLike } from '@/src/lib/dates';
import {
  computeLateFeeWithPolicy,
  type LateFeePolicySnapshot,
} from './lateFeePolicyCore';

export {
  DEFAULT_LATE_FEE_POLICY,
  PG_LATE_FEE_MAX_PERCENT_OF_PRINCIPAL,
  addCalendarDaysIso,
  applyLateFeePolicy,
  capLateFeeAtPrincipalPercent,
  chargeableOverdueDays,
  computeLateFeeWithPolicy,
  isLateFeeAbovePrincipalCap,
  lateFeeCapPaise,
  legacyLateFeePaise,
  resolveOverdueDays,
  type LateFeePolicySnapshot,
} from './lateFeePolicyCore';

function asOfIso(value?: DateLike): string {
  return formatDate(parseDate(value ?? new Date()));
}

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
  issueDate?: DateLike | null;
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
    issueDate: args.issueDate,
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
