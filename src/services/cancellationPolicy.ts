/**
 * Cancellation policy.
 *
 * Pure functions only — no DB, no I/O — so we can exhaustively unit-test the
 * money math and so the policy can be SNAPSHOTTED onto every booking at
 * creation time (see {@link DEFAULT_POLICY}). The snapshot lives inside
 * `bookings.pricing_snapshot.cancellationPolicy`, which means changing the
 * default later does NOT retroactively rewrite past bookings — every booking
 * is cancelled according to the policy that was in effect when it was made.
 *
 * The policy schema is intentionally minimal for MVP. PROJECT_PLAN.md §4.7
 * suggests "full refund > 7 days out, 50% within 48h"; we generalise to two
 * configurable windows so the operator can tune later without code changes.
 */
export type CancellationPolicy = {
  /** Tier 1: full refund of rent when cancelling at least this many hours before check-in. */
  fullRefundUntilHrsBefore: number;
  /** Tier 2: partial refund of rent when cancelling at least this many hours before check-in. */
  partialRefundUntilHrsBefore: number;
  /** Percentage (0–100) returned in the tier-2 window. */
  partialRefundPct: number;
  /** Percentage (0–100) of deposit always returned (we hold deposits against damages, not cancellation penalties). */
  depositRefundPct: number;
  /** Human label, displayed in the UI. */
  label: string;
};

export const DEFAULT_POLICY: CancellationPolicy = {
  fullRefundUntilHrsBefore: 168, // ≥ 7 days
  partialRefundUntilHrsBefore: 24, // 1–7 days
  partialRefundPct: 50,
  depositRefundPct: 100,
  label: 'Monthly stay',
};

/** Short fixed-date stays — stricter pre-check-in window, no partial tier. */
export const SHORT_STAY_POLICY: CancellationPolicy = {
  fullRefundUntilHrsBefore: 24,
  partialRefundUntilHrsBefore: 0,
  partialRefundPct: 0,
  depositRefundPct: 100,
  label: 'Short stay',
};

export type CancellationPolicyVariant = 'monthly' | 'fixed_date';

/**
 * Customer-facing cancellation summary derived from the policy tiers.
 * Used on booking review, confirmations, and invoices — not hardcoded in UI.
 */
export function formatCancellationPolicyCustomerCopy(
  policy: CancellationPolicy,
  variant: CancellationPolicyVariant,
): string {
  if (variant === 'fixed_date') {
    const windowHrs = policy.fullRefundUntilHrsBefore;
    const windowLabel =
      windowHrs >= 24 && windowHrs % 24 === 0
        ? `${windowHrs / 24} day${windowHrs === 24 ? '' : 's'}`
        : `${windowHrs} hours`;
    return (
      `Cancel at least ${windowLabel} before check-in for a full refund of rent and deposit. ` +
      'After that, rent is non-refundable for your reserved dates. ' +
      'If you have not checked in, your security deposit is fully refunded.'
    );
  }

  const fullDays = Math.max(1, Math.floor(policy.fullRefundUntilHrsBefore / 24));
  const partialHrs = policy.partialRefundUntilHrsBefore;
  const partialLabel =
    partialHrs >= 24
      ? `${Math.floor(partialHrs / 24)} day${partialHrs === 24 ? '' : 's'}`
      : `${partialHrs} hours`;

  return (
    `Cancel ${fullDays} or more days before check-in for a full rent refund. ` +
    `Cancel between ${partialLabel} and ${fullDays} days before check-in for a ${policy.partialRefundPct}% rent refund. ` +
    `Within ${partialLabel} of check-in, rent is non-refundable. ` +
    'Your security deposit is fully refunded on cancellation.'
  );
}

export type RefundBreakdownLine = {
  kind: 'rent_refund' | 'deposit_refund' | 'rent_forfeit' | 'deposit_forfeit';
  description: string;
  amountPaise: number;
};

export type RefundComputation = {
  /** True when the booking is eligible for a refund of any kind. */
  refundable: boolean;
  /** Tier the cancellation falls into. */
  tier: 'full' | 'partial' | 'none';
  hoursBeforeCheckIn: number;
  rentRefundPaise: number;
  depositRefundPaise: number;
  totalRefundPaise: number;
  /** Itemised lines suitable for an invoice / refund receipt. */
  breakdown: RefundBreakdownLine[];
  policy: CancellationPolicy;
};

export type ComputeRefundInput = {
  /** Booking's rent subtotal in paise (i.e. `bookings.subtotal_paise`). */
  rentSubtotalPaise: number;
  /** Booking's deposit in paise (i.e. `bookings.deposit_paise`). */
  depositPaise: number;
  /** Original check-in date (start of the stay). */
  checkInAt: Date;
  /** Moment the cancellation is being executed (now in production, mockable in tests). */
  cancelAt: Date;
  policy?: CancellationPolicy;
};

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Round-half-away-from-zero — paise are integers, and we never want to
 * silently shave a fraction off a refund.
 */
function roundPaise(n: number): number {
  return n >= 0 ? Math.round(n) : -Math.round(-n);
}

export function computeRefund(input: ComputeRefundInput): RefundComputation {
  const policy = input.policy ?? DEFAULT_POLICY;
  const hoursBefore =
    (input.checkInAt.getTime() - input.cancelAt.getTime()) / MS_PER_HOUR;

  // Negative deposit-refund percentages would be a configuration error
  // (deposit is the customer's money). Guard at the boundary.
  const depositRefundPct = Math.max(0, Math.min(100, policy.depositRefundPct));
  const depositRefundPaise = roundPaise(
    (input.depositPaise * depositRefundPct) / 100,
  );
  const depositForfeitPaise = Math.max(0, input.depositPaise - depositRefundPaise);

  let rentRefundPaise = 0;
  let tier: RefundComputation['tier'] = 'none';
  if (hoursBefore >= policy.fullRefundUntilHrsBefore) {
    rentRefundPaise = input.rentSubtotalPaise;
    tier = 'full';
  } else if (hoursBefore >= policy.partialRefundUntilHrsBefore) {
    const pct = Math.max(0, Math.min(100, policy.partialRefundPct));
    rentRefundPaise = roundPaise((input.rentSubtotalPaise * pct) / 100);
    tier = pct > 0 ? 'partial' : 'none';
  }
  const rentForfeitPaise = Math.max(0, input.rentSubtotalPaise - rentRefundPaise);

  const breakdown: RefundBreakdownLine[] = [];
  if (rentRefundPaise > 0) {
    breakdown.push({
      kind: 'rent_refund',
      description:
        tier === 'full'
          ? `Full rent refund (cancelled ${Math.round(hoursBefore)}h before check-in)`
          : `Partial rent refund (${policy.partialRefundPct}% — cancelled ${Math.round(hoursBefore)}h before check-in)`,
      amountPaise: rentRefundPaise,
    });
  }
  if (rentForfeitPaise > 0) {
    breakdown.push({
      kind: 'rent_forfeit',
      description: 'Rent forfeited per cancellation policy',
      amountPaise: rentForfeitPaise,
    });
  }
  if (depositRefundPaise > 0) {
    breakdown.push({
      kind: 'deposit_refund',
      description:
        depositRefundPct === 100
          ? 'Refundable security deposit (full)'
          : `Refundable security deposit (${depositRefundPct}%)`,
      amountPaise: depositRefundPaise,
    });
  }
  if (depositForfeitPaise > 0) {
    breakdown.push({
      kind: 'deposit_forfeit',
      description: 'Deposit forfeited per cancellation policy',
      amountPaise: depositForfeitPaise,
    });
  }

  const totalRefundPaise = rentRefundPaise + depositRefundPaise;
  return {
    refundable: totalRefundPaise > 0,
    tier,
    hoursBeforeCheckIn: hoursBefore,
    rentRefundPaise,
    depositRefundPaise,
    totalRefundPaise,
    breakdown,
    policy,
  };
}
