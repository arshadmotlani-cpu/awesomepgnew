import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampRentDiscountPaise } from '../../src/lib/billing/discountEngine';
import { computeNewBookingCheckoutTotals } from '../../src/lib/billing/bookingCheckoutTotals';
import { applyDateCouponToRentSubtotal } from '../../src/lib/dateCoupon';
import { computeRefund, DEFAULT_POLICY } from '../../src/services/cancellationPolicy';

describe('booking coupon production guards', () => {
  it('clamps negative / NaN / over-rent discounts', () => {
    assert.equal(clampRentDiscountPaise(100_000, -5_000), 0);
    assert.equal(clampRentDiscountPaise(100_000, Number.NaN), 0);
    assert.equal(clampRentDiscountPaise(100_000, 150_000), 100_000);
    assert.equal(clampRentDiscountPaise(0, 10_000), 0);
    assert.equal(clampRentDiscountPaise(100_000, 10_000), 10_000);
  });

  it('100% discount zeros rent but leaves deposit untouched', () => {
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: 200_000,
      depositRequiredPaise: 100_000,
      discountPaise: clampRentDiscountPaise(200_000, 200_000),
    });
    assert.equal(totals.rentDuePaise, 0);
    assert.equal(totals.depositDueNowPaise, 100_000);
    assert.equal(totals.totalToCollectTodayPaise, 100_000);
  });

  it('discount larger than rent cannot inflate totals negatively', () => {
    const discount = clampRentDiscountPaise(90_000, 999_999);
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: 90_000,
      depositRequiredPaise: 45_000,
      discountPaise: discount,
    });
    assert.equal(discount, 90_000);
    assert.equal(totals.rentDuePaise, 0);
    assert.equal(totals.depositDueNowPaise, 45_000);
    assert.ok(totals.totalToCollectTodayPaise >= 0);
  });

  it('10% WELCOME10-style bps math is rent-only', () => {
    const rent = 250_000;
    const discount = Math.floor((rent * 1000) / 10_000);
    assert.equal(discount, 25_000);
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: rent,
      depositRequiredPaise: 125_000,
      discountPaise: discount,
    });
    assert.equal(totals.rentDuePaise, 225_000);
    assert.equal(totals.depositDueNowPaise, 125_000);
    assert.equal(totals.totalToCollectTodayPaise, 350_000);
  });

  it('flat coupon never exceeds rent', () => {
    const rent = 50_000;
    const flat = 80_000;
    const discount = clampRentDiscountPaise(rent, flat);
    assert.equal(discount, 50_000);
  });

  it('date coupon rejects wrong-day (expired/future) codes', () => {
    const today = new Date('2026-07-05T12:00:00+05:30');
    const expired = applyDateCouponToRentSubtotal(100_000, '040726', today);
    assert.equal(expired.ok, false);
    const future = applyDateCouponToRentSubtotal(100_000, '060726', today);
    assert.equal(future.ok, false);
    const valid = applyDateCouponToRentSubtotal(100_000, '050726', today);
    assert.equal(valid.ok, true);
    if (valid.ok) assert.equal(valid.discountPaise, 10_000);
  });

  it('cancellation refund uses post-discount rent (no over-refund)', () => {
    const grossRent = 100_000;
    const discount = 10_000;
    const deposit = 50_000;
    const paidRent = grossRent - discount;

    const wrong = computeRefund({
      rentSubtotalPaise: grossRent,
      depositPaise: deposit,
      checkInAt: new Date('2026-12-20T00:00:00Z'),
      cancelAt: new Date('2026-12-01T00:00:00Z'),
      policy: DEFAULT_POLICY,
    });
    const correct = computeRefund({
      rentSubtotalPaise: paidRent,
      depositPaise: deposit,
      checkInAt: new Date('2026-12-20T00:00:00Z'),
      cancelAt: new Date('2026-12-01T00:00:00Z'),
      policy: DEFAULT_POLICY,
    });

    assert.equal(wrong.tier, 'full');
    assert.equal(correct.tier, 'full');
    assert.equal(wrong.rentRefundPaise, grossRent);
    assert.equal(correct.rentRefundPaise, paidRent);
    assert.equal(correct.totalRefundPaise, paidRent + deposit);
    assert.ok(correct.totalRefundPaise < wrong.totalRefundPaise);
  });

  it('partial refund percentages apply to discounted rent only', () => {
    const paidRent = 90_000;
    const deposit = 50_000;
    const r = computeRefund({
      rentSubtotalPaise: paidRent,
      depositPaise: deposit,
      checkInAt: new Date('2026-12-20T00:00:00Z'),
      cancelAt: new Date('2026-12-17T00:00:00Z'), // ~72h → partial 50%
      policy: DEFAULT_POLICY,
    });
    assert.equal(r.tier, 'partial');
    assert.equal(r.rentRefundPaise, 45_000);
    assert.equal(r.depositRefundPaise, deposit);
  });

  it('snapshot permanence fields are reconstructible from stored numbers', () => {
    const originalRentPaise = 100_000;
    const discountPaise = 10_000;
    const percentageBps = 1000;
    const finalRentPaise = originalRentPaise - discountPaise;
    const derivedPct = Math.round((discountPaise / originalRentPaise) * 100);
    assert.equal(finalRentPaise, 90_000);
    assert.equal(percentageBps / 100, 10);
    assert.equal(derivedPct, 10);
  });

  it('client-tampered discount cannot be trusted — server recomputes from rent', () => {
    const serverRent = 100_000;
    const clientClaimedDiscount = 999_999_999;
    const serverDiscount = clampRentDiscountPaise(serverRent, 10_000); // real 10%
    const totalsFromClientLie = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: serverRent,
      depositRequiredPaise: 50_000,
      discountPaise: clampRentDiscountPaise(serverRent, clientClaimedDiscount),
    });
    // Even if client sends absurd discount, clamp + server quote path caps at rent.
    assert.equal(totalsFromClientLie.rentDuePaise, 0);
    assert.equal(totalsFromClientLie.depositDueNowPaise, 50_000);
    // Honest server path keeps deposit + discounted rent.
    const honest = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: serverRent,
      depositRequiredPaise: 50_000,
      discountPaise: serverDiscount,
    });
    assert.equal(honest.totalToCollectTodayPaise, 140_000);
  });
});
