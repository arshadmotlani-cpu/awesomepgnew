import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECTIBLE_PRIOR_BOOKING_STATUSES,
  COLLECTIBLE_PRIOR_RESERVATION_STATUSES,
  EXCLUDED_PRIOR_BOOKING_STATUSES,
  isCollectiblePriorBookingStatus,
  isCollectiblePriorReservationStatus,
  isExcludedPriorBookingStatus,
} from '@/src/lib/billing/priorOutstandingEligibility';
import { paymentReviewNeedsManualAllocation } from '@/src/lib/operations/paymentReviewBreakdown';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

test('collectible prior booking statuses exclude unpaid and dead bookings', () => {
  assert.deepEqual(COLLECTIBLE_PRIOR_BOOKING_STATUSES, ['confirmed', 'completed']);
  assert.equal(isCollectiblePriorBookingStatus('confirmed'), true);
  assert.equal(isCollectiblePriorBookingStatus('completed'), true);
  assert.equal(isCollectiblePriorBookingStatus('pending_payment'), false);
  assert.equal(isCollectiblePriorBookingStatus('pending_approval'), false);
  assert.equal(isCollectiblePriorBookingStatus('cancelled'), false);
  assert.equal(isCollectiblePriorBookingStatus('draft'), false);
  assert.equal(isCollectiblePriorBookingStatus('superseded'), false);
  assert.equal(isCollectiblePriorBookingStatus('refunded'), false);
});

test('excluded prior booking statuses cover rejected and failed lifecycle paths', () => {
  for (const status of [
    'draft',
    'pending_payment',
    'pending_approval',
    'superseded',
    'cancelled',
    'refunded',
  ]) {
    assert.equal(isExcludedPriorBookingStatus(status), true, status);
    assert.equal(isCollectiblePriorBookingStatus(status), false, status);
  }
  assert.deepEqual(EXCLUDED_PRIOR_BOOKING_STATUSES, [
    'draft',
    'pending_payment',
    'pending_approval',
    'superseded',
    'cancelled',
    'refunded',
  ]);
});

test('collectible prior reservation statuses exclude holds and cancelled beds', () => {
  assert.deepEqual(COLLECTIBLE_PRIOR_RESERVATION_STATUSES, ['active', 'completed']);
  assert.equal(isCollectiblePriorReservationStatus('active'), true);
  assert.equal(isCollectiblePriorReservationStatus('completed'), true);
  assert.equal(isCollectiblePriorReservationStatus('hold'), false);
  assert.equal(isCollectiblePriorReservationStatus('under_review'), false);
  assert.equal(isCollectiblePriorReservationStatus('cancelled'), false);
});

test('payment review skips manual allocation when booking QR payment matches expected split', () => {
  const item = {
    kind: 'qr',
    bookingId: 'bk-1',
    overpaidPaise: 0,
    bookingPaymentReview: {
      rentDuePaise: 190_000,
      depositCashDuePaise: 95_000,
      bookingTotalDuePaise: 285_000,
      amountSubmittedPaise: 285_000,
      rentPaisePaid: 190_000,
      depositPaisePaid: 95_000,
      depositDuePaise: 0,
      isFullPayment: true,
      canPartialApprove: false,
      bookingCode: 'APG-2026-1',
    },
    bookingDetails: { priorOutstandingItems: [] },
    expectedTotalPaise: 285_000,
    submittedAmountPaise: 285_000,
    amountPaise: 285_000,
    pgName: 'Demo',
  } as PendingPaymentReviewItem;

  assert.equal(paymentReviewNeedsManualAllocation(item), false);
});

test('payment review requires manual allocation for short or over payments', () => {
  const base = {
    kind: 'qr',
    bookingId: 'bk-1',
    bookingPaymentReview: {
      rentDuePaise: 190_000,
      depositCashDuePaise: 95_000,
      bookingTotalDuePaise: 285_000,
      amountSubmittedPaise: 200_000,
      rentPaisePaid: 190_000,
      depositPaisePaid: 10_000,
      depositDuePaise: 85_000,
      isFullPayment: false,
      canPartialApprove: true,
      bookingCode: 'APG-2026-1',
    },
    bookingDetails: { priorOutstandingItems: [] },
    expectedTotalPaise: 285_000,
    pgName: 'Demo',
  } as PendingPaymentReviewItem;

  assert.equal(
    paymentReviewNeedsManualAllocation({ ...base, overpaidPaise: 0, submittedAmountPaise: 200_000, amountPaise: 200_000 }),
    true,
  );
  assert.equal(
    paymentReviewNeedsManualAllocation({ ...base, overpaidPaise: 5_000, submittedAmountPaise: 290_000, amountPaise: 290_000 }),
    true,
  );
});
