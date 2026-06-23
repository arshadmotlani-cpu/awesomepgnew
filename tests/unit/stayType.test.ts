import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePriceBreakdown, computeFixedStayDepositPaise, computeMonthlyDepositPaise, type RateSnapshot } from '@/src/services/pricing';
import {
  FIXED_DATE_MAX_NIGHTS,
  pricingModeFromStayType,
  stayTypeFromPricingMode,
  validateFixedDateStay,
} from '@/src/lib/stayType';

const BED_ID = 'bed-test';
const RATE: RateSnapshot = {
  bedPriceId: 'price-1',
  dailyRatePaise: 33_000,
  weeklyRatePaise: 190_000,
  monthlyRatePaise: 500_000,
  securityDepositPaise: 1_000_000,
  dailySecurityDepositPaise: 0,
  weeklySecurityDepositPaise: 0,
  monthlySecurityDepositPaise: 1_000_000,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
};

test('stayType maps monthly_stay to open_ended pricing mode', () => {
  assert.equal(pricingModeFromStayType('monthly_stay'), 'open_ended');
  assert.equal(pricingModeFromStayType('fixed_date_stay'), 'fixed_stay');
});

test('legacy duration modes map to stay types', () => {
  assert.equal(stayTypeFromPricingMode('daily'), 'fixed_date_stay');
  assert.equal(stayTypeFromPricingMode('weekly'), 'fixed_date_stay');
  assert.equal(stayTypeFromPricingMode('fixed_stay'), 'fixed_date_stay');
  assert.equal(stayTypeFromPricingMode('open_ended'), 'monthly_stay');
  assert.equal(stayTypeFromPricingMode('monthly'), 'monthly_stay');
});

test('fixed-date: 25 Jun → 05 Jul 2026 = 10 nights auto total', () => {
  const q = computePriceBreakdown({
    bedId: BED_ID,
    rate: RATE,
    startDate: '2026-06-25',
    endDate: '2026-07-05',
    durationMode: pricingModeFromStayType('fixed_date_stay'),
    includeDeposit: false,
  });
  assert.equal(q.nights, 10);
  assert.equal(q.subtotalPaise, 289_000);
  assert.equal(q.pricingStrategy, 'weeks_plus_days');
});

test('fixed-date validation rejects stays over 30 nights', () => {
  const err = validateFixedDateStay('2026-06-01', '2026-07-05', '2026-06-01');
  assert.match(err ?? '', /30 nights/);
});

test('fixed-date validation rejects checkout beyond booking window', () => {
  const err = validateFixedDateStay('2026-06-01', '2026-07-15', '2026-06-01');
  assert.ok(err);
});

test('fixed-date validation accepts 7-night stay within window', () => {
  assert.equal(validateFixedDateStay('2026-06-10', '2026-06-17', '2026-06-01'), null);
});

test('FIXED_DATE_MAX_NIGHTS is 30', () => {
  assert.equal(FIXED_DATE_MAX_NIGHTS, 30);
});

test('monthly stay deposit = 2 weeks rent (half of monthly)', () => {
  const monthlyRentPaise = 600_000;
  const deposit = computeMonthlyDepositPaise({
    ...RATE,
    monthlyRatePaise: monthlyRentPaise,
  });
  assert.equal(deposit, 300_000);
});

test('fixed-date 10-night stay: auto rent + 50% deposit', () => {
  const q = computePriceBreakdown({
    bedId: BED_ID,
    rate: RATE,
    startDate: '2026-06-25',
    endDate: '2026-07-05',
    durationMode: pricingModeFromStayType('fixed_date_stay'),
    includeDeposit: true,
  });
  assert.equal(q.nights, 10);
  assert.equal(q.subtotalPaise, 289_000);
  assert.equal(q.depositPaise, 144_500);
  assert.equal(q.depositPaise, computeFixedStayDepositPaise(q.subtotalPaise));
});

test('fixed-date 29-night stay: auto rent + 50% deposit', () => {
  const q = computePriceBreakdown({
    bedId: BED_ID,
    rate: RATE,
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    durationMode: pricingModeFromStayType('fixed_date_stay'),
    includeDeposit: true,
  });
  assert.equal(q.nights, 29);
  assert.ok(q.subtotalPaise > 0);
  assert.equal(q.depositPaise, computeFixedStayDepositPaise(q.subtotalPaise));
  assert.equal(q.depositPaise, Math.ceil(q.subtotalPaise * 0.5));
});

test('monthly stay open_ended: first month rent + 2-week deposit', () => {
  const monthlyRentPaise = 600_000;
  const rate: RateSnapshot = { ...RATE, monthlyRatePaise: monthlyRentPaise };
  const q = computePriceBreakdown({
    bedId: BED_ID,
    rate,
    startDate: '2026-06-01',
    endDate: null,
    durationMode: pricingModeFromStayType('monthly_stay'),
    includeDeposit: true,
  });
  assert.equal(q.subtotalPaise, monthlyRentPaise);
  assert.equal(q.depositPaise, 300_000);
  assert.equal(q.totalPaise, monthlyRentPaise + 300_000);
});
