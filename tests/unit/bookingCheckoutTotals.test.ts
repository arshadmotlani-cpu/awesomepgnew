import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  breakdownBookingCheckoutPayment,
  buildBookingCheckoutSummaryLines,
  computeNewBookingCheckoutTotals,
  resolveBookingDepositCreditAppliedPaise,
} from '../../src/lib/billing/bookingCheckoutTotals';
import { quoteToBookingDraftPricing } from '../../src/lib/booking/bookingDraft';
import { computePriceBreakdown } from '../../src/services/pricing';
import { shouldShowHybridRentBreakdown } from '../../src/lib/pricing/formatRentLines';
import { paiseToInr } from '../../src/lib/format';

const FIXED_RATE = {
  bedPriceId: 'bp-1',
  dailyRatePaise: 33_000,
  weeklyRatePaise: 190_000,
  monthlyRatePaise: 0,
  securityDepositPaise: 0,
  dailySecurityDepositPaise: 0,
  weeklySecurityDepositPaise: 0,
  monthlySecurityDepositPaise: 0,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
};

function quoteFixedStay(nights: number) {
  const end = nights === 1 ? '2026-06-02' : nights === 3 ? '2026-06-04' : nights === 7 ? '2026-06-08' : nights === 10 ? '2026-06-11' : '2026-06-15';
  return computePriceBreakdown({
    bedId: 'bed-1',
    rate: FIXED_RATE,
    startDate: '2026-06-01',
    endDate: end,
    durationMode: 'fixed_stay',
    includeDeposit: true,
  });
}

describe('booking checkout totals SSOT', () => {
  it('3-day booking: daily rent, 50% deposit, rent+deposit total', () => {
    const q = quoteFixedStay(3);
    assert.equal(q.subtotalPaise, 99_000);
    assert.equal(q.depositPaise, 49_500);
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: q.subtotalPaise,
      depositRequiredPaise: q.depositPaise,
    });
    assert.equal(totals.rentDuePaise, 99_000);
    assert.equal(totals.depositDueNowPaise, 49_500);
    assert.equal(totals.totalToCollectTodayPaise, 148_500);
  });

  it('7-day booking: weekly rent + deposit', () => {
    const q = quoteFixedStay(7);
    assert.equal(q.subtotalPaise, 190_000);
    assert.equal(q.depositPaise, 95_000);
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: q.subtotalPaise,
      depositRequiredPaise: q.depositPaise,
    });
    assert.equal(totals.totalToCollectTodayPaise, 285_000);
  });

  it('10-day hybrid: week + 3 days rent, deposit, full total', () => {
    const q = quoteFixedStay(10);
    assert.equal(q.subtotalPaise, 289_000);
    assert.equal(q.depositPaise, 144_500);
    assert.equal(shouldShowHybridRentBreakdown(q.lineItems), true);
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: q.subtotalPaise,
      depositRequiredPaise: q.depositPaise,
    });
    assert.equal(totals.totalToCollectTodayPaise, 433_500);
  });

  it('14-day booking: two weekly blocks flat', () => {
    const q = quoteFixedStay(14);
    assert.equal(q.subtotalPaise, 380_000);
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: q.subtotalPaise,
      depositRequiredPaise: q.depositPaise,
    });
    assert.equal(totals.depositDueNowPaise, 190_000);
    assert.equal(totals.totalToCollectTodayPaise, 570_000);
  });

  it('includes prior outstanding in total to collect', () => {
    const q = quoteFixedStay(7);
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: q.subtotalPaise,
      depositRequiredPaise: q.depositPaise,
      priorOutstanding: {
        totalPaise: 16_500,
        items: [{ label: 'Deposit balance due', amountPaise: 16_500, kind: 'deposit' }],
      },
    });
    assert.equal(totals.priorOutstandingPaise, 16_500);
    assert.equal(totals.totalToCollectTodayPaise, 285_000 + 16_500);
  });

  it('zero prior outstanding omits section via empty items', () => {
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: 190_000,
      depositRequiredPaise: 95_000,
      priorOutstanding: { totalPaise: 0, items: [] },
    });
    assert.equal(totals.priorOutstandingPaise, 0);
    assert.equal(totals.totalToCollectTodayPaise, 285_000);
  });

  it('breakdownBookingCheckoutPayment uses rent subtotal not total minus deposit', () => {
    const breakdown = breakdownBookingCheckoutPayment({
      subtotalPaise: 190_000,
      discountPaise: 0,
      depositPaise: 95_000,
      pricingSnapshot: {
        depositCredit: { appliedPaise: 0 },
        priorOutstanding: { totalPaise: 16_500, items: [] },
      },
    });
    assert.equal(breakdown.rentDuePaise, 190_000);
    assert.equal(breakdown.depositCashDuePaise, 95_000);
    assert.equal(breakdown.bookingTotalDuePaise, 301_500);
  });

  it('ignores auto deposit credit without adminTransferred flag', () => {
    assert.equal(
      resolveBookingDepositCreditAppliedPaise({ appliedPaise: 16_500 }),
      0,
    );
    const breakdown = breakdownBookingCheckoutPayment({
      subtotalPaise: 190_000,
      discountPaise: 0,
      depositPaise: 95_000,
      pricingSnapshot: {
        depositCredit: { appliedPaise: 16_500 },
      },
    });
    assert.equal(breakdown.depositCashDuePaise, 95_000);
    assert.equal(breakdown.creditAppliedPaise, 0);
  });

  it('honors admin-transferred deposit credit only', () => {
    const breakdown = breakdownBookingCheckoutPayment({
      subtotalPaise: 190_000,
      discountPaise: 0,
      depositPaise: 95_000,
      pricingSnapshot: {
        depositCredit: { appliedPaise: 16_500, adminTransferred: true },
      },
    });
    assert.equal(breakdown.depositCashDuePaise, 78_500);
    assert.equal(breakdown.creditAppliedPaise, 16_500);
  });

  it('10% rent coupon reduces rent only — deposit unchanged', () => {
    const rentSubtotalPaise = 100_000;
    const depositRequiredPaise = 50_000;
    const discountPaise = Math.floor((rentSubtotalPaise * 1000) / 10_000); // WELCOME10 = 10%
    assert.equal(discountPaise, 10_000);

    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise,
      depositRequiredPaise,
      discountPaise,
    });

    assert.equal(totals.rentDuePaise, 90_000);
    assert.equal(totals.depositDueNowPaise, 50_000);
    assert.equal(totals.depositRequiredPaise, 50_000);
    assert.equal(totals.newBookingTotalPaise, 140_000);
    assert.equal(totals.totalToCollectTodayPaise, 140_000);

    const withPrior = computeNewBookingCheckoutTotals({
      rentSubtotalPaise,
      depositRequiredPaise,
      discountPaise,
      priorOutstanding: {
        totalPaise: 5_000,
        items: [{ label: 'Prior due', amountPaise: 5_000, kind: 'other' }],
      },
    });
    assert.equal(withPrior.depositDueNowPaise, 50_000);
    assert.equal(withPrior.totalToCollectTodayPaise, 145_000);
  });
});

describe('booking checkout summary lines + coupon regressions', () => {
  const rentPaise = 360_600; // ₹3,606
  const depositPaise = 360_600;
  const discount10 = 36_060; // ₹361

  it('production fixture: 10% coupon → ₹6,851 total with ordered summary lines', () => {
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      discountPaise: discount10,
    });
    assert.equal(totals.rentDuePaise, 324_540);
    assert.equal(totals.depositDueNowPaise, depositPaise);
    assert.equal(totals.totalToCollectTodayPaise, 685_140);
    assert.equal(paiseToInr(totals.totalToCollectTodayPaise), '₹6,851');

    const lines = buildBookingCheckoutSummaryLines({
      rentSubtotalPaise: rentPaise,
      discountPaise: discount10,
      depositRequiredPaise: depositPaise,
      totalToCollectTodayPaise: totals.totalToCollectTodayPaise,
    });
    assert.deepEqual(
      lines.map((l) => l.kind),
      ['rent', 'coupon_discount', 'deposit', 'total'],
    );
    assert.equal(lines[0]!.amountPaise, rentPaise);
    assert.equal(lines[1]!.amountPaise, discount10);
    assert.equal(lines[1]!.isCredit, true);
    assert.equal(lines[2]!.amountPaise, depositPaise);
    assert.equal(lines[3]!.amountPaise, 685_140);

    const signedSum = lines
      .filter((l) => l.kind !== 'total')
      .reduce((s, l) => s + (l.isCredit ? -l.amountPaise : l.amountPaise), 0);
    assert.equal(signedSum, totals.totalToCollectTodayPaise);
  });

  it('no coupon: rent + deposit only', () => {
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
    });
    assert.equal(totals.totalToCollectTodayPaise, rentPaise + depositPaise);
    const lines = buildBookingCheckoutSummaryLines({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      totalToCollectTodayPaise: totals.totalToCollectTodayPaise,
    });
    assert.deepEqual(
      lines.map((l) => l.kind),
      ['rent', 'deposit', 'total'],
    );
  });

  it('flat coupon larger than rent: rent due 0, deposit full', () => {
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      discountPaise: rentPaise + 50_000,
    });
    assert.equal(totals.rentDuePaise, 0);
    assert.equal(totals.depositDueNowPaise, depositPaise);
    assert.equal(totals.totalToCollectTodayPaise, depositPaise);
  });

  it('deposit ₹0: total is rent minus discount', () => {
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: 0,
      discountPaise: discount10,
    });
    assert.equal(totals.totalToCollectTodayPaise, rentPaise - discount10);
    const lines = buildBookingCheckoutSummaryLines({
      rentSubtotalPaise: rentPaise,
      discountPaise: discount10,
      depositRequiredPaise: 0,
      totalToCollectTodayPaise: totals.totalToCollectTodayPaise,
    });
    assert.ok(!lines.some((l) => l.kind === 'deposit'));
  });

  it('quoteToBookingDraftPricing applies discount into totalDuePaise', () => {
    const pricing = quoteToBookingDraftPricing({
      subtotalPaise: rentPaise,
      depositPaise,
      discountPaise: discount10,
    });
    assert.equal(pricing.discountPaise, discount10);
    assert.equal(pricing.totalDuePaise, 685_140);
  });

  it('deposit credit shows required deposit + credit lines that sum correctly', () => {
    const credit = 100_000;
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      depositCreditAppliedPaise: credit,
      discountPaise: discount10,
    });
    const lines = buildBookingCheckoutSummaryLines({
      rentSubtotalPaise: rentPaise,
      discountPaise: discount10,
      depositRequiredPaise: depositPaise,
      depositCreditAppliedPaise: credit,
      totalToCollectTodayPaise: totals.totalToCollectTodayPaise,
    });
    assert.deepEqual(
      lines.map((l) => l.kind),
      ['rent', 'coupon_discount', 'deposit', 'deposit_credit', 'total'],
    );
    const signedSum = lines
      .filter((l) => l.kind !== 'total')
      .reduce((s, l) => s + (l.isCredit ? -l.amountPaise : l.amountPaise), 0);
    assert.equal(signedSum, totals.totalToCollectTodayPaise);
  });
});
