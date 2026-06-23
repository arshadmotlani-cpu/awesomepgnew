import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  breakdownBookingCheckoutPayment,
  computeNewBookingCheckoutTotals,
  resolveBookingDepositCreditAppliedPaise,
} from '../../src/lib/billing/bookingCheckoutTotals';
import { computePriceBreakdown } from '../../src/services/pricing';
import { shouldShowHybridRentBreakdown } from '../../src/lib/pricing/formatRentLines';

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
});
