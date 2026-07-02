import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  computePriceBreakdown,
  monthsBetween,
  type RateSnapshot,
} from '../../src/services/pricing';

// Realistic rates pulled from the Phase 1 seed (Triple Sharing AC tier).
const RATE: RateSnapshot = {
  bedPriceId: '00000000-0000-0000-0000-000000000001',
  dailyRatePaise: 80_000, // ₹800/day
  weeklyRatePaise: 4_50_000, // ₹4,500/week
  monthlyRatePaise: 14_00_000, // ₹14,000/month
  securityDepositPaise: 14_00_000,
  dailySecurityDepositPaise: 80_000,
  weeklySecurityDepositPaise: 4_50_000,
  monthlySecurityDepositPaise: 28_00_000,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
};

const BED_ID = '11111111-1111-1111-1111-111111111111';

function quote(args: {
  startDate: string;
  endDate: string | null;
  durationMode: 'daily' | 'weekly' | 'monthly' | 'open_ended' | 'fixed_stay';
  includeDeposit?: boolean;
  rate?: RateSnapshot;
}) {
  return computePriceBreakdown({
    bedId: BED_ID,
    rate: args.rate ?? RATE,
    startDate: args.startDate,
    endDate: args.endDate,
    durationMode: args.durationMode,
    includeDeposit: args.includeDeposit ?? false,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// monthsBetween (pure helper)
// ───────────────────────────────────────────────────────────────────────────

test('monthsBetween: exact whole months', () => {
  assert.deepEqual(monthsBetween('2026-06-15', '2026-08-15'), {
    months: 2,
    remainingDays: 0,
  });
});

test('monthsBetween: 2 months + 7 leftover days', () => {
  assert.deepEqual(monthsBetween('2026-06-15', '2026-08-22'), {
    months: 2,
    remainingDays: 7,
  });
});

test('monthsBetween: short stay (< 1 month) is all leftover days', () => {
  assert.deepEqual(monthsBetween('2026-06-15', '2026-06-25'), {
    months: 0,
    remainingDays: 10,
  });
});

test('monthsBetween: clamps to month-end for Jan 31 starts', () => {
  // 01-31 → 02-28 (1 month) → 03-28 (2 months); remainder = 03 days to 03-31
  assert.deepEqual(monthsBetween('2026-01-31', '2026-03-31'), {
    months: 2,
    remainingDays: 3,
  });
});

test('monthsBetween: equal start/end is zero', () => {
  assert.deepEqual(monthsBetween('2026-06-15', '2026-06-15'), {
    months: 0,
    remainingDays: 0,
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Daily pricing
// ───────────────────────────────────────────────────────────────────────────

test('daily: charges every night at daily rate', () => {
  const q = quote({ startDate: '2026-06-01', endDate: '2026-06-10', durationMode: 'daily' });
  assert.equal(q.nights, 9);
  assert.equal(q.units, 9);
  assert.equal(q.subtotalPaise, 9 * 80_000);
  assert.equal(q.depositPaise, 0);
  assert.equal(q.totalPaise, 9 * 80_000);
  assert.equal(q.lineItems.length, 1);
  assert.equal(q.lineItems[0].kind, 'daily_nights');
});

test('daily: 1 night booking', () => {
  const q = quote({ startDate: '2026-06-01', endDate: '2026-06-02', durationMode: 'daily' });
  assert.equal(q.nights, 1);
  assert.equal(q.subtotalPaise, 80_000);
  assert.match(q.lineItems[0].description, /1 night /);
});

test('daily: end must be after start', () => {
  assert.throws(
    () => quote({ startDate: '2026-06-10', endDate: '2026-06-05', durationMode: 'daily' }),
    /must be strictly after/,
  );
  assert.throws(
    () => quote({ startDate: '2026-06-10', endDate: '2026-06-10', durationMode: 'daily' }),
    /must be strictly after/,
  );
});

test('daily: missing endDate is rejected', () => {
  assert.throws(
    () => quote({ startDate: '2026-06-10', endDate: null, durationMode: 'daily' }),
    /endDate is required/,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Weekly pricing
// ───────────────────────────────────────────────────────────────────────────

test('weekly: exact one-week stay charges 1 week', () => {
  const q = quote({ startDate: '2026-06-01', endDate: '2026-06-08', durationMode: 'weekly' });
  assert.equal(q.nights, 7);
  assert.equal(q.units, 1);
  assert.equal(q.subtotalPaise, 4_50_000);
});

test('weekly: partial second week rounds up (ceil)', () => {
  // 8 nights => 2 weeks
  const q = quote({ startDate: '2026-06-01', endDate: '2026-06-09', durationMode: 'weekly' });
  assert.equal(q.nights, 8);
  assert.equal(q.units, 2);
  assert.equal(q.subtotalPaise, 2 * 4_50_000);
});

test('weekly: under one week still charges 1 week', () => {
  const q = quote({ startDate: '2026-06-01', endDate: '2026-06-04', durationMode: 'weekly' });
  assert.equal(q.units, 1);
  assert.equal(q.subtotalPaise, 4_50_000);
});

// ───────────────────────────────────────────────────────────────────────────
// Monthly pricing (with pro-rata)
// ───────────────────────────────────────────────────────────────────────────

test('monthly: exact 2 months charges 2 × monthly, no pro-rata', () => {
  const q = quote({ startDate: '2026-06-15', endDate: '2026-08-15', durationMode: 'monthly' });
  assert.equal(q.units, 2);
  assert.equal(q.subtotalPaise, 2 * 14_00_000);
  assert.equal(q.lineItems.length, 1);
  assert.equal(q.lineItems[0].kind, 'monthly_cycle');
});

test('monthly: 2 months + 7 pro-rata days at daily rate', () => {
  const q = quote({ startDate: '2026-06-15', endDate: '2026-08-22', durationMode: 'monthly' });
  assert.equal(q.units, 2);
  assert.equal(q.subtotalPaise, 2 * 14_00_000 + 7 * 80_000);
  const proRata = q.lineItems.find((li) => li.kind === 'pro_rata_days')!;
  assert.equal(proRata.units, 7);
  assert.equal(proRata.unitPricePaise, 80_000);
});

test('monthly: pro-rata derives from monthly/30 when daily rate is unset', () => {
  const noDailyRate: RateSnapshot = { ...RATE, dailyRatePaise: 0 };
  const q = quote({
    startDate: '2026-06-15',
    endDate: '2026-07-22',
    durationMode: 'monthly',
    rate: noDailyRate,
  });
  // 1 month + 7 pro-rata days at ceil(14_00_000 / 30) = 46_667 paise
  const derivedDaily = Math.ceil(14_00_000 / 30);
  assert.equal(q.units, 1);
  assert.equal(q.subtotalPaise, 14_00_000 + 7 * derivedDaily);
});

test('monthly: short stay (< 1 month) is all pro-rata', () => {
  const q = quote({ startDate: '2026-06-01', endDate: '2026-06-10', durationMode: 'monthly' });
  assert.equal(q.units, 0);
  assert.equal(q.lineItems.length, 1);
  assert.equal(q.lineItems[0].kind, 'pro_rata_days');
  assert.equal(q.subtotalPaise, 9 * 80_000);
});

test('monthly: Jan 31 + 2 months handles month-end clamp', () => {
  // 01-31 → 02-28 → 03-28 = 2 months, then 03-28 → 03-31 = 3 pro-rata days
  const q = quote({ startDate: '2026-01-31', endDate: '2026-03-31', durationMode: 'monthly' });
  assert.equal(q.units, 2);
  const proRata = q.lineItems.find((li) => li.kind === 'pro_rata_days')!;
  assert.equal(proRata.units, 3);
});

// ───────────────────────────────────────────────────────────────────────────
// Open-ended pricing
// ───────────────────────────────────────────────────────────────────────────

test('open_ended: charges 1 month upfront, ignores endDate', () => {
  const q = quote({ startDate: '2026-06-01', endDate: null, durationMode: 'open_ended' });
  assert.equal(q.endDate, null);
  assert.equal(q.units, 1);
  assert.equal(q.subtotalPaise, 14_00_000);
  assert.match(q.notes ?? '', /open-ended/i);
});

test('open_ended: nights is null when no endDate', () => {
  const q = quote({ startDate: '2026-06-01', endDate: null, durationMode: 'open_ended' });
  assert.equal(q.nights, null);
});

test('open_ended: deposit uses bed_prices monthly deposit when set', () => {
  const oneMonth: RateSnapshot = {
    ...RATE,
    monthlySecurityDepositPaise: 14_00_000,
    securityDepositPaise: 14_00_000,
  };
  const q = quote({
    startDate: '2026-06-01',
    endDate: null,
    durationMode: 'open_ended',
    includeDeposit: true,
    rate: oneMonth,
  });
  assert.equal(q.depositPaise, 14_00_000);
  assert.match(q.lineItems.find((li) => li.kind === 'deposit')?.description ?? '', /1 month/i);
});

test('open_ended: deposit defaults to one month rent when bed_prices deposit unset', () => {
  const policyDefault: RateSnapshot = {
    ...RATE,
    monthlySecurityDepositPaise: 0,
    securityDepositPaise: 0,
    pgMonthlyDepositPolicy: 'one_month',
  };
  const q = quote({
    startDate: '2026-06-01',
    endDate: null,
    durationMode: 'open_ended',
    includeDeposit: true,
    rate: policyDefault,
  });
  assert.equal(q.depositPaise, 14_00_000);
  assert.match(q.lineItems.find((li) => li.kind === 'deposit')?.description ?? '', /1 month/i);
});

// ───────────────────────────────────────────────────────────────────────────
// Deposit
// ───────────────────────────────────────────────────────────────────────────

test('deposit: included when includeDeposit=true', () => {
  const q = quote({
    startDate: '2026-06-01',
    endDate: '2026-06-10',
    durationMode: 'daily',
    includeDeposit: true,
  });
  assert.equal(q.depositPaise, 80_000);
  assert.equal(q.totalPaise, 9 * 80_000 + 80_000);
  assert(q.lineItems.some((li) => li.kind === 'deposit'));
});

test('deposit: omitted when includeDeposit=false', () => {
  const q = quote({
    startDate: '2026-06-01',
    endDate: '2026-06-10',
    durationMode: 'daily',
    includeDeposit: false,
  });
  assert.equal(q.depositPaise, 0);
  assert.equal(q.lineItems.find((li) => li.kind === 'deposit'), undefined);
});

test('deposit: omitted when bed has zero security deposit', () => {
  const noDeposit: RateSnapshot = {
    ...RATE,
    securityDepositPaise: 0,
    dailySecurityDepositPaise: 0,
    weeklySecurityDepositPaise: 0,
    monthlySecurityDepositPaise: 0,
  };
  const q = quote({
    startDate: '2026-06-01',
    endDate: '2026-06-10',
    durationMode: 'daily',
    includeDeposit: true,
    rate: noDeposit,
  });
  assert.equal(q.depositPaise, 0);
  assert.equal(q.lineItems.find((li) => li.kind === 'deposit'), undefined);
});

// ───────────────────────────────────────────────────────────────────────────
// Rate validation
// ───────────────────────────────────────────────────────────────────────────

test('daily: throws when bed has no daily rate', () => {
  const broken: RateSnapshot = { ...RATE, dailyRatePaise: 0 };
  assert.throws(
    () =>
      quote({
        startDate: '2026-06-01',
        endDate: '2026-06-05',
        durationMode: 'daily',
        rate: broken,
      }),
    /No positive daily rate/,
  );
});

test('weekly: throws when bed has no weekly rate', () => {
  const broken: RateSnapshot = { ...RATE, weeklyRatePaise: 0 };
  assert.throws(
    () =>
      quote({
        startDate: '2026-06-01',
        endDate: '2026-06-08',
        durationMode: 'weekly',
        rate: broken,
      }),
    /No positive weekly rate/,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Snapshot fidelity
// ───────────────────────────────────────────────────────────────────────────

test('snapshot shape matches the bookings.pricing_snapshot.perBed[] contract', () => {
  const q = quote({ startDate: '2026-06-15', endDate: '2026-08-22', durationMode: 'monthly' });
  // Spot-check every field the schema expects to read back.
  assert.equal(typeof q.bedId, 'string');
  assert.equal(q.durationMode, 'monthly');
  assert.equal(typeof q.units, 'number');
  assert.equal(typeof q.rate.dailyRatePaise, 'number');
  assert.equal(typeof q.rate.weeklyRatePaise, 'number');
  assert.equal(typeof q.rate.monthlyRatePaise, 'number');
  assert.equal(typeof q.rate.securityDepositPaise, 'number');
  assert.equal(typeof q.totalPaise, 'number');
  assert.equal(typeof q.computedAt, 'string');
  // Every line item adds up to subtotal+deposit.
  const sum = q.lineItems.reduce((a, li) => a + li.amountPaise, 0);
  assert.equal(sum, q.subtotalPaise + q.depositPaise);
});

// ───────────────────────────────────────────────────────────────────────────
// Fixed stay — lowest price
// ───────────────────────────────────────────────────────────────────────────

const FIXED_RATE: RateSnapshot = {
  ...RATE,
  dailyRatePaise: 33_000,
  weeklyRatePaise: 190_000,
};

test('fixed_stay: 10 nights picks week+3 days (₹2890) over pure daily (₹3300)', () => {
  const q = computePriceBreakdown({
    bedId: BED_ID,
    rate: FIXED_RATE,
    startDate: '2026-06-01',
    endDate: '2026-06-11',
    durationMode: 'fixed_stay',
    includeDeposit: true,
  });
  assert.equal(q.nights, 10);
  assert.equal(q.subtotalPaise, 289_000);
  assert.equal(q.pricingStrategy, 'weeks_plus_days');
  assert.equal(q.depositPaise, 144_500);
});

test('fixed_stay: 7 nights uses single weekly rate', () => {
  const q = computePriceBreakdown({
    bedId: BED_ID,
    rate: FIXED_RATE,
    startDate: '2026-06-01',
    endDate: '2026-06-08',
    durationMode: 'fixed_stay',
    includeDeposit: false,
  });
  assert.equal(q.subtotalPaise, 190_000);
});

test('fixed_stay: pure daily wins when cheaper', () => {
  const cheapDaily: RateSnapshot = {
    ...FIXED_RATE,
    dailyRatePaise: 10_000,
  };
  const q = computePriceBreakdown({
    bedId: BED_ID,
    rate: cheapDaily,
    startDate: '2026-06-01',
    endDate: '2026-06-04',
    durationMode: 'fixed_stay',
    includeDeposit: false,
  });
  assert.equal(q.nights, 3);
  assert.equal(q.subtotalPaise, 30_000);
  assert.equal(q.pricingStrategy, 'pure_daily');
});
