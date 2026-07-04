import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isBookingCheckoutEligibleForPaymentReview,
  isPaymentRecordEligibleForReview,
} from '@/src/lib/operations/paymentReviewEligibility';
import { dedupePendingPaymentReviews } from '@/src/lib/operations/dedupePendingPaymentReviews';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

describe('paymentReviewEligibility', () => {
  test('confirmed booking checkout must not appear in Operations', () => {
    assert.equal(isBookingCheckoutEligibleForPaymentReview('confirmed'), false);
    assert.equal(isBookingCheckoutEligibleForPaymentReview('completed'), false);
    assert.equal(isBookingCheckoutEligibleForPaymentReview('cancelled'), false);
  });

  test('awaiting payment statuses remain eligible', () => {
    assert.equal(isBookingCheckoutEligibleForPaymentReview('pending_payment'), true);
    assert.equal(isBookingCheckoutEligibleForPaymentReview('pending_approval'), true);
    assert.equal(isBookingCheckoutEligibleForPaymentReview('draft'), true);
  });

  test('only pending records with screenshot are eligible', () => {
    assert.equal(isPaymentRecordEligibleForReview('pending', true), true);
    assert.equal(isPaymentRecordEligibleForReview('pending', false), false);
    assert.equal(isPaymentRecordEligibleForReview('approved', true), false);
    assert.equal(isPaymentRecordEligibleForReview('rejected', true), false);
  });
});

function qrReview(input: {
  key: string;
  entityId: string;
  bookingId: string;
  submittedAt: string;
}): PendingPaymentReviewItem {
  return {
    key: input.key,
    kind: 'qr',
    pgId: 'pg-1',
    pgName: 'Test PG',
    residentName: 'Kunal Chaudhari',
    phone: null,
    bookingCode: 'APG-2026-0015',
    roomNumber: '102',
    bedCode: 'A',
    paymentTypeLabel: 'New booking',
    title: 'Kunal · Booking APG-2026-0015',
    subtitle: 'Booking checkout',
    amountPaise: 824_200,
    screenshotUrl: 'https://example.com/proof.jpg',
    entityId: input.entityId,
    customerId: 'cust-1',
    bookingId: input.bookingId,
    expectedLines: [],
    expectedTotalPaise: 824_200,
    receivedPaise: 824_200,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: false,
    canReject: true,
    proofSubmittedAt: input.submittedAt,
  };
}

describe('payment review queue after approval', () => {
  test('dedupe keeps one review per booking — simulates post-approval empty queue', () => {
    const items = dedupePendingPaymentReviews([
      qrReview({
        key: 'qr-stale',
        entityId: 'pay-stale',
        bookingId: 'booking-1',
        submittedAt: '2026-07-01T10:00:00.000Z',
      }),
    ]);
    assert.equal(items.length, 1);
    const filtered = items.filter((item) =>
      isBookingCheckoutEligibleForPaymentReview('confirmed'),
    );
    assert.equal(filtered.length, 0, 'confirmed booking must not remain in queue');
  });

  test('hard rule — approved payment status never eligible', () => {
    assert.equal(
      isPaymentRecordEligibleForReview('approved', true),
      false,
      'approved pg_payment_records must never surface in Operations',
    );
  });
});
