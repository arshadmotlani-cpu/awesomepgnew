import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMonthlyDepositPaise,
  computeFixedStayDepositPaise,
  computeRequiredDepositPaise,
  computePriceBreakdown,
  type RateSnapshot,
} from '@/src/services/pricing';
import {
  displayMonthlyDepositPaise,
  MONTHLY_STAY_DEPOSIT_REFERENCE_LABEL,
} from '@/src/lib/customerDepositDisplay';
import { pricingModeFromStayType } from '@/src/lib/stayType';

const BED_ID = 'bed-ssot-test';
const RATE: RateSnapshot = {
  bedPriceId: 'price-ssot',
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

/**
 * SSOT chain (pre-booking display → booking creation):
 * depositRules.ts → pricing.ts quoteBookingPrice/quoteBedPrice → bookings.deposit_paise
 *
 * After a booking exists, required deposit is always bookings.deposit_paise (snapshotted at creation).
 * Pre-booking UI must not read bed_prices.security_deposit_paise columns for display.
 */

test('monthly UI reference deposit matches quote engine (₹6000/mo → ₹3000)', () => {
  const monthlyRentPaise = 600_000;
  const rate: RateSnapshot = { ...RATE, monthlyRatePaise: monthlyRentPaise };
  const fromQuote = computeMonthlyDepositPaise(rate);
  const fromUi = displayMonthlyDepositPaise({
    monthlyRatePaise: monthlyRentPaise,
    securityDepositPaise: 1_000_000,
    monthlySecurityDepositPaise: 1_000_000,
  });

  assert.equal(fromQuote, 300_000);
  assert.equal(fromUi, fromQuote);
});

test('legacy bed_prices deposit columns must not drive pre-booking UI reference rate', () => {
  const monthlyRentPaise = 600_000;
  const legacyColumnPaise = 1_000_000;
  const uiDeposit = displayMonthlyDepositPaise({
    monthlyRatePaise: monthlyRentPaise,
    securityDepositPaise: legacyColumnPaise,
    monthlySecurityDepositPaise: legacyColumnPaise,
  });

  assert.notEqual(uiDeposit, legacyColumnPaise);
  assert.equal(uiDeposit, 300_000);
});

test('server-enriched quotedMonthlyDepositPaise is preferred on bed pages', () => {
  const quoted = 300_000;
  assert.equal(
    displayMonthlyDepositPaise({
      monthlyRatePaise: 600_000,
      securityDepositPaise: 1_000_000,
      quotedMonthlyDepositPaise: quoted,
    }),
    quoted,
  );
});

test('fixed-date 10-night stay: UI/checkout deposit matches quote engine (50% of subtotal)', () => {
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

test('admin assign-bed preview deposit matches open_ended quote engine', () => {
  const monthlyRentPaise = 600_000;
  const rate: RateSnapshot = { ...RATE, monthlyRatePaise: monthlyRentPaise };
  const adminPreviewDeposit = computeRequiredDepositPaise(rate, 'open_ended', monthlyRentPaise);
  const createBookingQuote = computePriceBreakdown({
    bedId: BED_ID,
    rate,
    startDate: '2026-06-01',
    endDate: null,
    durationMode: 'open_ended',
    includeDeposit: true,
  }).depositPaise;

  assert.equal(adminPreviewDeposit, 300_000);
  assert.equal(createBookingQuote, adminPreviewDeposit);
});

test('booking.deposit_paise must equal quote engine deposit at creation time', () => {
  const monthlyRentPaise = 600_000;
  const rate: RateSnapshot = { ...RATE, monthlyRatePaise: monthlyRentPaise };
  const quoteAtCreation = computePriceBreakdown({
    bedId: BED_ID,
    rate,
    startDate: '2026-06-01',
    endDate: null,
    durationMode: 'open_ended',
    includeDeposit: true,
  });

  const storedBookingDepositPaise = quoteAtCreation.depositPaise;
  assert.equal(storedBookingDepositPaise, 300_000);
  assert.equal(
    storedBookingDepositPaise,
    computeRequiredDepositPaise(rate, 'open_ended', quoteAtCreation.subtotalPaise),
  );
});

test('pre-booking bed page label is reference rate, not required deposit', () => {
  assert.match(MONTHLY_STAY_DEPOSIT_REFERENCE_LABEL, /reference/i);
  assert.doesNotMatch(MONTHLY_STAY_DEPOSIT_REFERENCE_LABEL, /required/i);
});
