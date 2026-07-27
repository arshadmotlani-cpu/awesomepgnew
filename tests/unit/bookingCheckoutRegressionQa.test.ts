/**
 * Checkout regression QA matrix — pure-function coverage for paths that must
 * not block booking. Browser payment/proof/admin approval remain manual on prod.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  applyBookingReviewCoupon,
  previewCouponStateFromDiscount,
  removeBookingReviewCoupon,
  reviewCheckoutTotalsWithCoupon,
} from '../../src/lib/booking/bookingCouponReview';
import {
  bookingFlowReducer,
  isStuckCreateSubmit,
  shouldRecoverStuckContinue,
} from '../../src/lib/booking/bookingFlowMachine';

describe('checkout regression QA matrix', () => {
  const rentPaise = 500_000;
  const depositPaise = 500_000;

  it('no coupon → full total (Continue payload has no coupon)', () => {
    const totals = reviewCheckoutTotalsWithCoupon({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      appliedCoupon: null,
    });
    assert.equal(totals.totalToCollectTodayPaise, rentPaise + depositPaise);
    assert.equal(totals.rentDuePaise, rentPaise);
  });

  it('valid coupon → rent/total drop; deposit unchanged', () => {
    const applied = applyBookingReviewCoupon(null, {
      code: 'WELCOME10',
      discountPaise: 50_000,
    });
    const totals = reviewCheckoutTotalsWithCoupon({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      appliedCoupon: applied,
    });
    assert.equal(totals.rentDuePaise, 450_000);
    assert.equal(totals.depositDueNowPaise, depositPaise);
    assert.equal(totals.totalToCollectTodayPaise, 950_000);
  });

  it('invalid coupon → applied stays null; Continue still unblocked', () => {
    const preview = previewCouponStateFromDiscount(
      { error: 'Invalid or expired promo code' },
      rentPaise,
    );
    assert.equal(preview.status, 'invalid');
    assert.equal(
      bookingFlowReducer('REVIEW', { type: 'CONTINUE_SIGNED_IN' }),
      'CREATE_BOOKING',
    );
  });

  it('remove coupon → restores full totals', () => {
    const cleared = removeBookingReviewCoupon();
    const totals = reviewCheckoutTotalsWithCoupon({
      rentSubtotalPaise: rentPaise,
      depositRequiredPaise: depositPaise,
      appliedCoupon: cleared,
    });
    assert.equal(totals.totalToCollectTodayPaise, 1_000_000);
  });

  it('stuck Continue is detectable and recoverable', () => {
    assert.equal(
      isStuckCreateSubmit({
        step: 'CREATE_BOOKING',
        submitGuard: true,
        actionPending: false,
        actionStatus: 'idle',
      }),
      true,
    );
    assert.equal(
      shouldRecoverStuckContinue({ step: 'CREATE_BOOKING', submitGuard: true }),
      true,
    );
    const afterReset = bookingFlowReducer('CREATE_BOOKING', { type: 'RESET' });
    assert.equal(afterReset, 'REVIEW');
    assert.equal(
      bookingFlowReducer(afterReset, { type: 'CONTINUE_SIGNED_IN' }),
      'CREATE_BOOKING',
    );
  });
});
