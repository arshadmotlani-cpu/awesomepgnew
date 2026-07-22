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

test('payment review is verification-only — no manual allocation gate', () => {
  const item = {
    kind: 'qr',
    bookingId: 'bk-1',
    overpaidPaise: 5_000,
    expectedTotalPaise: 285_000,
    submittedAmountPaise: 290_000,
    amountPaise: 290_000,
    pgName: 'Demo',
  } as PendingPaymentReviewItem;

  assert.equal(paymentReviewNeedsManualAllocation(item), false);
});
