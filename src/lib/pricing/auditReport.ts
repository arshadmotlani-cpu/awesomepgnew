/**
 * Pricing audit documentation — formulas, inputs, outputs, and edge cases
 * for every booking path. Used by Pricing Health Report and admin docs.
 */

import {
  computeLowestFixedStayRent,
  type FixedStayPricingStrategy,
} from '@/src/lib/pricing/fixedStayOptimizer';
import {
  computeFixedStayDepositPaise,
  computeMonthlyDepositPaise,
  computePriceBreakdown,
  monthsBetween,
  type PricingMode,
  type RateSnapshot,
} from '@/src/services/pricing';

export type PricingPathAudit = {
  path: string;
  formula: string;
  inputs: string[];
  output: string;
  edgeCases: string[];
};

export const PRICING_PATH_AUDITS: PricingPathAudit[] = [
  {
    path: 'Open-ended stay',
    formula: 'rent = 1 × monthlyRate; deposit = ceil(monthlyRate / 2)',
    inputs: ['monthlyRatePaise', 'startDate'],
    output: 'subtotalPaise, depositPaise, totalPaise',
    edgeCases: [
      'No endDate — first month billed at checkout; subsequent months via rent invoices.',
      'Deposit never double-counted in rent subtotal.',
    ],
  },
  {
    path: 'Monthly stay',
    formula:
      'rent = wholeMonths × monthlyRate + remainderDays × dailyRate (or monthly/30); deposit = ceil(monthlyRate / 2)',
    inputs: ['startDate', 'endDate', 'monthlyRatePaise', 'dailyRatePaise'],
    output: 'subtotalPaise with monthly_cycle + pro_rata_days line items',
    edgeCases: [
      'monthsBetween uses calendar months with month-end clamping (Jan 31 → Feb 28).',
      'Pro-rata uses daily rate when set, else ceil(monthly/30).',
    ],
  },
  {
    path: 'Weekly stay',
    formula: 'rent = ceil(nights / 7) × weeklyRate; deposit = weeklySecurityDeposit or securityDeposit',
    inputs: ['nights', 'weeklyRatePaise'],
    output: 'subtotalPaise, single weekly_cycle line',
    edgeCases: ['Partial week rounds up to full week (ceil).'],
  },
  {
    path: 'Daily stay',
    formula: 'rent = nights × dailyRate; deposit = dailySecurityDeposit or securityDeposit',
    inputs: ['nights', 'dailyRatePaise'],
    output: 'subtotalPaise, single daily_nights line',
    edgeCases: ['Half-open range [start, end) — nights = diffDays.'],
  },
  {
    path: 'Fixed stay (lowest price)',
    formula:
      'min(pure daily, weekly ceil, all week+day combos, monthly pro-rata if ≥28 nights)',
    inputs: ['nights', 'dailyRatePaise', 'weeklyRatePaise', 'monthlyRatePaise', 'startDate', 'endDate'],
    output: 'lowest subtotal + strategy label + line items',
    edgeCases: [
      '10 nights @ ₹330/day vs 1wk+3d @ ₹1900+₹990 → ₹2890 wins over ₹3300.',
      'Never applies deposit twice — deposit = ceil(50% × rent subtotal).',
      'lowestPriceApplied flag when a cheaper strategy beats naive week+day split.',
    ],
  },
  {
    path: 'Deposit (fixed stay)',
    formula: 'deposit = ceil(rentSubtotal × 0.5)',
    inputs: ['subtotalPaise after lowest-price rent'],
    output: 'depositPaise — separate from rent subtotal',
    edgeCases: ['Deposit line item appended after rent; not included in subtotalPaise.'],
  },
  {
    path: 'Deposit (monthly / open-ended)',
    formula: 'deposit = ceil(monthlyRate / 2) — two weeks rent',
    inputs: ['monthlyRatePaise'],
    output: 'depositPaise independent of stay length',
    edgeCases: ['Rent change triggers deposit delta via pricing propagation service.'],
  },
  {
    path: 'PS4 add-on',
    formula: 'plan price from playstation/plans.ts — billed separately from booking total',
    inputs: ['ps4Plan id'],
    output: 'pending playstation_memberships row; not in bookings.total_paise',
    edgeCases: ['Optional at checkout; does not affect rent/deposit quote.'],
  },
  {
    path: 'Promo code (date coupon)',
    formula: 'discount = floor(rentSubtotal × 10%) when code = DDMMYY (IST) and date matches',
    inputs: ['coupon code', 'rent subtotal only'],
    output: 'reduced checkout total; stored in pricing_snapshot.dateCoupon',
    edgeCases: [
      'Applies to rent only — not deposit or PS4.',
      'Single coupon per booking at creation.',
    ],
  },
  {
    path: 'Combined checkout total',
    formula: 'total = rentSubtotal − coupon + (deposit − depositWalletCredit) [+ PS4 separate]',
    inputs: ['quote', 'wallet credit', 'coupon'],
    output: 'amount due at payment',
    edgeCases: [
      'Partial deposit option: pay floor(deposit/2) when eligible.',
      'No duplicate multipliers — each component computed once.',
    ],
  },
];

export type PricingSelfCheck = {
  name: string;
  pass: boolean;
  detail: string;
};

/** Runtime sanity checks on pure pricing math (no DB). */
export function runPricingSelfChecks(sampleRate: RateSnapshot): PricingSelfCheck[] {
  const checks: PricingSelfCheck[] = [];
  const bedId = 'audit-bed';

  const modes: PricingMode[] = ['daily', 'weekly', 'monthly', 'open_ended', 'fixed_stay'];
  for (const mode of modes) {
    try {
      const q = computePriceBreakdown({
        bedId,
        rate: sampleRate,
        startDate: '2026-06-01',
        endDate: mode === 'open_ended' ? null : '2026-06-11',
        durationMode: mode,
        includeDeposit: true,
      });
      const rentFromLines = q.lineItems
        .filter((li) => li.kind !== 'deposit')
        .reduce((a, li) => a + li.amountPaise, 0);
      const depositFromLines = q.lineItems
        .filter((li) => li.kind === 'deposit')
        .reduce((a, li) => a + li.amountPaise, 0);
      checks.push({
        name: `${mode}_line_items_match_subtotal`,
        pass: rentFromLines === q.subtotalPaise,
        detail: `rent lines ${rentFromLines} vs subtotal ${q.subtotalPaise}`,
      });
      checks.push({
        name: `${mode}_deposit_not_in_subtotal`,
        pass: q.totalPaise === q.subtotalPaise + q.depositPaise && depositFromLines === q.depositPaise,
        detail: `total ${q.totalPaise} = subtotal + deposit`,
      });
      checks.push({
        name: `${mode}_no_double_deposit`,
        pass: q.lineItems.filter((li) => li.kind === 'deposit').length <= 1,
        detail: 'at most one deposit line',
      });
    } catch (err) {
      checks.push({
        name: `${mode}_computes`,
        pass: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const tenDay = computeLowestFixedStayRent({
    nights: 10,
    dailyRatePaise: 33_000,
    weeklyRatePaise: 190_000,
  });
  checks.push({
    name: 'fixed_stay_10day_lowest_price',
    pass: tenDay.subtotalPaise === 289_000,
    detail: `expected ₹2890, got ₹${tenDay.subtotalPaise / 100} (${tenDay.strategy})`,
  });

  const monthlyDep = computeMonthlyDepositPaise(sampleRate);
  checks.push({
    name: 'monthly_deposit_2_weeks_rent',
    pass: monthlyDep === Math.ceil(sampleRate.monthlyRatePaise / 2),
    detail: `deposit ${monthlyDep} = 2 weeks (½ × ${sampleRate.monthlyRatePaise})`,
  });

  const fixedDep = computeFixedStayDepositPaise(289_000);
  checks.push({
    name: 'fixed_deposit_50pct',
    pass: fixedDep === 144_500,
    detail: `50% of ₹2890 = ₹${fixedDep / 100}`,
  });

  const { months, remainingDays } = monthsBetween('2026-06-15', '2026-08-22');
  checks.push({
    name: 'months_between_sanity',
    pass: months === 2 && remainingDays === 7,
    detail: `${months} months + ${remainingDays} days`,
  });

  return checks;
}

export function strategyLabel(strategy: FixedStayPricingStrategy): string {
  switch (strategy) {
    case 'weeks_plus_days':
      return 'Weeks + extra days';
    case 'pure_daily':
      return 'Daily rate (all nights)';
    case 'weekly_ceil':
      return 'Weekly rate (rounded up)';
    case 'monthly_pro_rata':
      return 'Monthly + pro-rata days';
    default:
      return strategy;
  }
}
