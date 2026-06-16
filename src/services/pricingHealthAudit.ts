/**
 * Pricing health audit — validates all pricing paths and self-checks.
 */

import {
  PRICING_PATH_AUDITS,
  runPricingSelfChecks,
  type PricingPathAudit,
} from '@/src/lib/pricing/auditReport';
import type { RateSnapshot } from '@/src/services/pricing';
import { computeLowestFixedStayRent } from '@/src/lib/pricing/fixedStayOptimizer';

export type PricingHealthSection = {
  name: string;
  pass: boolean;
  summary: string;
  details: string[];
};

export type PricingHealthReport = {
  asOf: string;
  allPass: boolean;
  paths: PricingPathAudit[];
  sections: PricingHealthSection[];
};

const SAMPLE_RATE: RateSnapshot = {
  bedPriceId: 'health-audit',
  dailyRatePaise: 33_000,
  weeklyRatePaise: 190_000,
  monthlyRatePaise: 140_000,
  securityDepositPaise: 280_000,
  dailySecurityDepositPaise: 50_000,
  weeklySecurityDepositPaise: 100_000,
  monthlySecurityDepositPaise: 280_000,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
};

export async function runPricingHealthAudit(): Promise<PricingHealthReport> {
  const sections: PricingHealthSection[] = [];

  const selfChecks = runPricingSelfChecks(SAMPLE_RATE);
  const failedSelf = selfChecks.filter((c) => !c.pass);
  sections.push({
    name: 'Rent calculations',
    pass: failedSelf.length === 0,
    summary:
      failedSelf.length === 0
        ? `${selfChecks.length} self-checks passed across all duration modes.`
        : `${failedSelf.length} rent calculation issue(s).`,
    details: failedSelf.map((c) => `${c.name}: ${c.detail}`),
  });

  const tenDay = computeLowestFixedStayRent({
    nights: 10,
    dailyRatePaise: 33_000,
    weeklyRatePaise: 190_000,
  });
  sections.push({
    name: 'Fixed stay lowest-price',
    pass: tenDay.subtotalPaise === 289_000 && tenDay.strategy === 'weeks_plus_days',
    summary:
      tenDay.subtotalPaise === 289_000
        ? '10-day stay: ₹2890 (1 week + 3 days) beats ₹3300 pure daily.'
        : `Expected ₹2890, got ₹${tenDay.subtotalPaise / 100} (${tenDay.strategy}).`,
    details: tenDay.lineItems.map((li) => `${li.description}: ₹${li.amountPaise / 100}`),
  });

  const fourteenDay = computeLowestFixedStayRent({
    nights: 14,
    dailyRatePaise: 33_000,
    weeklyRatePaise: 190_000,
  });
  sections.push({
    name: 'Weekly/day split',
    pass: fourteenDay.subtotalPaise === 380_000,
    summary: `14 nights → ₹${fourteenDay.subtotalPaise / 100} (${fourteenDay.strategy})`,
    details: [],
  });

  const depositChecks = selfChecks.filter((c) => c.name.includes('deposit'));
  sections.push({
    name: 'Deposit calculations',
    pass: depositChecks.every((c) => c.pass),
    summary: depositChecks.every((c) => c.pass)
      ? 'Monthly 2× rent and fixed 50% deposit rules verified.'
      : 'Deposit rule mismatch detected.',
    details: depositChecks.filter((c) => !c.pass).map((c) => c.detail),
  });

  sections.push({
    name: 'Open-ended pricing',
    pass: selfChecks.find((c) => c.name === 'open_ended_line_items_match_subtotal')?.pass ?? false,
    summary: 'First month upfront + 2× monthly deposit.',
    details: [],
  });

  sections.push({
    name: 'Revenue projections',
    pass: failedSelf.length === 0,
    summary: 'Quote engine outputs align with line-item sums (SSOT for booking snapshots).',
    details: [],
  });

  return {
    asOf: new Date().toISOString(),
    allPass: sections.every((s) => s.pass),
    paths: PRICING_PATH_AUDITS,
    sections,
  };
}
