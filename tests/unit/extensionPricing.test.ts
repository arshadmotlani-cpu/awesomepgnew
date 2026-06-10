/**
 * Phase 5 — extension pricing.
 *
 * Extensions are priced with `includeDeposit: false` (deposit was already
 * collected on the primary booking). This file verifies that invariant for
 * each duration mode + the per-bed line-total accounting that
 * `recordExtensionPaymentSuccess` later snapshots onto
 * `bookings.pricing_snapshot.extensions`.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  computePriceBreakdown,
  type RateSnapshot,
} from '../../src/services/pricing';

const RATE: RateSnapshot = {
  bedPriceId: 'price-1',
  dailyRatePaise: 80_000, // ₹800/day
  weeklyRatePaise: 4_50_000, // ₹4,500/week
  monthlyRatePaise: 14_00_000, // ₹14,000/month
  securityDepositPaise: 14_00_000,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
};

const BED = 'bed-1';

function ext(args: {
  fromDate: string;
  untilDate: string;
  durationMode: 'daily' | 'weekly' | 'monthly';
}) {
  return computePriceBreakdown({
    bedId: BED,
    rate: RATE,
    startDate: args.fromDate,
    endDate: args.untilDate,
    durationMode: args.durationMode,
    includeDeposit: false,
  });
}

test('extension quote — daily mode, never includes a deposit line', () => {
  const q = ext({ fromDate: '2026-09-01', untilDate: '2026-09-08', durationMode: 'daily' });
  assert.equal(q.depositPaise, 0);
  assert.equal(q.subtotalPaise, 7 * 80_000);
  assert.equal(q.totalPaise, q.subtotalPaise);
  assert.ok(!q.lineItems.some((l) => l.kind === 'deposit'));
});

test('extension quote — weekly mode rolls partial weeks up', () => {
  const q = ext({ fromDate: '2026-09-01', untilDate: '2026-09-10', durationMode: 'weekly' });
  // 9 nights → ceil(9/7) = 2 weeks.
  assert.equal(q.units, 2);
  assert.equal(q.subtotalPaise, 2 * 4_50_000);
  assert.equal(q.depositPaise, 0);
});

test('extension quote — monthly mode splits whole + pro-rata days', () => {
  const q = ext({ fromDate: '2026-09-15', untilDate: '2026-11-22', durationMode: 'monthly' });
  // 09-15 → 10-15 → 11-15 (2 months) + 7 leftover days.
  const month = q.lineItems.find((l) => l.kind === 'monthly_cycle')!;
  const proRata = q.lineItems.find((l) => l.kind === 'pro_rata_days')!;
  assert.equal(month.units, 2);
  assert.equal(month.amountPaise, 2 * 14_00_000);
  assert.equal(proRata.units, 7);
  assert.equal(proRata.amountPaise, 7 * 80_000);
  assert.equal(q.subtotalPaise, month.amountPaise + proRata.amountPaise);
  assert.equal(q.depositPaise, 0);
  assert.equal(q.totalPaise, q.subtotalPaise);
});

test('extension quote — invariant: lineItems sum (excluding deposit) === subtotal', () => {
  for (const mode of ['daily', 'weekly', 'monthly'] as const) {
    const q = ext({ fromDate: '2026-09-01', untilDate: '2026-10-08', durationMode: mode });
    const sum = q.lineItems
      .filter((l) => l.kind !== 'deposit')
      .reduce((acc, l) => acc + l.amountPaise, 0);
    assert.equal(sum, q.subtotalPaise, `mode=${mode} lineItems sum mismatch`);
    assert.equal(q.depositPaise, 0, `mode=${mode} should not bill deposit`);
  }
});

test('extension quote — rejects untilDate <= fromDate', () => {
  assert.throws(() =>
    ext({ fromDate: '2026-09-08', untilDate: '2026-09-08', durationMode: 'daily' }),
  );
  assert.throws(() =>
    ext({ fromDate: '2026-09-08', untilDate: '2026-09-01', durationMode: 'daily' }),
  );
});
