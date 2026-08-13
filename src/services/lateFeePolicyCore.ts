/**
 * Pure late-fee policy math — safe for client bundles.
 * DB resolution lives in `lateFeePolicy.ts`.
 */

import { addDays, diffDays, formatDate, parseDate, type DateLike } from '@/src/lib/dates';
import { chargeableLateFeeDaysFromIssue } from '@/src/lib/billing/lateFeeSchedule';

/**
 * AwesomePG hard cap — late fee for a single invoice never exceeds 10% of principal.
 * Applied after policy/schedule math; not compounded monthly.
 */
export const PG_LATE_FEE_MAX_PERCENT_OF_PRINCIPAL = 10;

/** Maximum late fee (paise) for an invoice principal. */
export function lateFeeCapPaise(principalPaise: number): number {
  if (principalPaise <= 0) return 0;
  return Math.floor((principalPaise * PG_LATE_FEE_MAX_PERCENT_OF_PRINCIPAL) / 100);
}

/** Clamp calculated late fee to the 10% principal cap. */
export function capLateFeeAtPrincipalPercent(principalPaise: number, lateFeePaise: number): number {
  if (lateFeePaise <= 0) return 0;
  return Math.min(lateFeePaise, lateFeeCapPaise(principalPaise));
}

/** Stored/locked late fee exceeds the 10% cap — flag for admin review; do not auto-rewrite. */
export function isLateFeeAbovePrincipalCap(principalPaise: number, lateFeePaise: number): boolean {
  return lateFeePaise > lateFeeCapPaise(principalPaise);
}

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

/**
 * Days past due date (0 on due date). When only billingMonth is given,
 * uses legacy due-on-5th (billing_month day 5) to match billing.dueDateForMonth.
 */
export function resolveOverdueDays(args: {
  issueDate?: DateLike | null;
  dueDate?: DateLike | null;
  billingMonth?: DateLike | null;
  today?: DateLike;
}): number {
  const today = args.today != null ? asOfIso(args.today) : formatDate(new Date());
  if (args.issueDate != null) {
    return chargeableLateFeeDaysFromIssue(args.issueDate, today);
  }
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
  return capLateFeeAtPrincipalPercent(args.principalPaise, Math.max(0, fee));
}

/** Legacy fallback: 1% of principal per overdue day, floored. */
export function legacyLateFeePaise(principalPaise: number, overdueDays: number): number {
  if (principalPaise <= 0 || overdueDays <= 0) return 0;
  const fee = Math.floor((principalPaise * overdueDays) / 100);
  return capLateFeeAtPrincipalPercent(principalPaise, fee);
}

/**
 * Compute late fee with an optional resolved policy.
 * When policy is null/undefined, preserves current 1%/day behavior.
 */
export function computeLateFeeWithPolicy(args: {
  principalPaise: number;
  issueDate?: DateLike | null;
  dueDate?: DateLike | null;
  billingMonth?: DateLike | null;
  today?: DateLike;
  policy?: LateFeePolicySnapshot | null;
  /** When set, skip policies that don't apply to this charge kind. */
  chargeKind?: 'rent' | 'electricity';
}): number {
  const overdue = resolveOverdueDays({
    issueDate: args.issueDate,
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

/** Anchor helper for tests / reminder engine — not late-fee specific. */
export function addCalendarDaysIso(isoDate: string, days: number): string {
  return formatDate(addDays(isoDate, days));
}
