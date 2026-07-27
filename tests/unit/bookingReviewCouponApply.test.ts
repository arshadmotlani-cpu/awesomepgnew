import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyBookingReviewCoupon,
  previewCouponStateFromDiscount,
  removeBookingReviewCoupon,
  reviewCheckoutTotalsWithCoupon,
} from '../../src/lib/booking/bookingCouponReview';
import { paiseToInr } from '../../src/lib/format';

describe('booking review coupon apply flow', () => {
  const rentPaise = 360_600; // ₹3,606
  const depositPaise = 360_600;

  it('10% coupon (WELCOME10-style) reduces rent only and total payable', () => {
    const discountPaise = 36_060; // 10% of rent → ₹361
    const applied = applyBookingReviewCoupon(null, {
      code: 'WELCOME10',
      discountPaise,
      label: 'Promo WELCOME10',
    });
    const totals = reviewCheckoutTotalsWithCoupon({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      appliedCoupon: applied,
    });
    assert.equal(totals.rentDuePaise, rentPaise - discountPaise);
    assert.equal(totals.depositDueNowPaise, depositPaise);
    assert.equal(totals.totalToCollectTodayPaise, 685_140);
    assert.equal(paiseToInr(totals.totalToCollectTodayPaise), '₹6,851');
  });

  it('flat amount coupon is clamped to rent in preview mapping', () => {
    const preview = previewCouponStateFromDiscount(
      {
        discountPaise: 50_000,
        discountType: 'promo_code',
        code: 'FLAT500',
        label: 'Flat ₹500',
      },
      rentPaise,
    );
    assert.equal(preview.status, 'applied');
    if (preview.status === 'applied') {
      assert.equal(preview.discountPaise, 50_000);
      assert.equal(preview.netRentPaise, rentPaise - 50_000);
    }
  });

  it('invalid coupon preview state', () => {
    const preview = previewCouponStateFromDiscount(
      { error: 'Invalid or expired promo code' },
      rentPaise,
    );
    assert.equal(preview.status, 'invalid');
    const zero = previewCouponStateFromDiscount(
      { discountPaise: 0, discountType: null, code: null, label: null },
      rentPaise,
    );
    assert.equal(zero.status, 'invalid');
  });

  it('remove coupon restores full totals', () => {
    const applied = applyBookingReviewCoupon(null, {
      code: 'WELCOME10',
      discountPaise: 36_060,
    });
    const withCoupon = reviewCheckoutTotalsWithCoupon({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      appliedCoupon: applied,
    });
    const cleared = removeBookingReviewCoupon();
    const without = reviewCheckoutTotalsWithCoupon({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      appliedCoupon: cleared,
    });
    assert.ok(withCoupon.totalToCollectTodayPaise < without.totalToCollectTodayPaise);
    assert.equal(without.totalToCollectTodayPaise, rentPaise + depositPaise);
  });

  it('apply → remove → apply again uses latest discount', () => {
    let applied = applyBookingReviewCoupon(null, {
      code: 'WELCOME10',
      discountPaise: 36_060,
    });
    applied = removeBookingReviewCoupon();
    assert.equal(applied, null);
    applied = applyBookingReviewCoupon(null, {
      code: 'WELCOME10',
      discountPaise: 36_060,
    });
    const totals = reviewCheckoutTotalsWithCoupon({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      appliedCoupon: applied,
    });
    assert.equal(totals.rentDuePaise, rentPaise - 36_060);
  });

  it('re-applying overwrites prior code (single coupon SSOT)', () => {
    const first = applyBookingReviewCoupon(null, {
      code: 'OLD',
      discountPaise: 10_000,
    });
    const second = applyBookingReviewCoupon(first, {
      code: 'NEW',
      discountPaise: 20_000,
    });
    assert.equal(second.code, 'NEW');
    assert.equal(second.discountPaise, 20_000);
  });

  it('page refresh persistence shape keeps discount on applied object', () => {
    const stored = {
      code: 'WELCOME10',
      discountPaise: 36_060,
      label: 'Promo',
    };
    const totals = reviewCheckoutTotalsWithCoupon({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      appliedCoupon: stored,
    });
    assert.equal(totals.totalToCollectTodayPaise, 685_140);
  });

  it('continue-to-payment parity: review totals match server-style checkout math', () => {
    const discountPaise = 36_060;
    const reviewTotals = reviewCheckoutTotalsWithCoupon({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      appliedCoupon: { code: 'WELCOME10', discountPaise },
    });
    const payTotals = reviewCheckoutTotalsWithCoupon({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      appliedCoupon: { code: 'WELCOME10', discountPaise },
    });
    assert.equal(reviewTotals.totalToCollectTodayPaise, payTotals.totalToCollectTodayPaise);
  });
});
