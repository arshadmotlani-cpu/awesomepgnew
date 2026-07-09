/**
 * Acceptance contract — booking payment review SSOT lifecycle.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  isBookingCheckoutEligibleForPaymentReview,
  isPaymentRecordEligibleForReview,
} from '@/src/lib/operations/paymentReviewSsot';
import { PAYMENT_ALREADY_PROCESSED_MESSAGE } from '@/src/lib/operations/paymentReviewMessages';
import { dedupePendingPaymentReviews } from '@/src/lib/operations/dedupePendingPaymentReviews';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('payment review SSOT architecture', () => {
  test('stale SQL detects confirmed booking, succeeded payment, and active assignment', () => {
    const ssot = read('src/lib/operations/paymentReviewSsot.ts');
    assert.match(ssot, /b\.status NOT IN/);
    assert.match(ssot, /b\.status = 'superseded'/);
    assert.match(ssot, /purpose IN \('booking', 'bed_reserve'\)/);
    assert.match(ssot, /bed_reservations br/);
    assert.match(ssot, /CURRENT_DATE <@ br\.stay_range/);
    assert.match(ssot, /FROM bookings newer/);
  });

  test('reconciliation is the single self-heal entry on queue load', () => {
    const queue = read('src/services/paymentProofQueue.ts');
    assert.match(queue, /reconcileBookingPaymentReviewQueue/);
    assert.doesNotMatch(queue, /cleanupOrphanPendingBookingPaymentReviews/);
    const reconciliation = read('src/services/paymentReviewReconciliation.ts');
    assert.match(reconciliation, /finalizeStaleBookingPaymentReview/);
    assert.match(reconciliation, /closeOrphanPaymentReviewArtifacts/);
    assert.match(reconciliation, /linkOrphanBookingPaymentRecords/);
  });

  test('reject always cancels booking holds even when payment already processed', () => {
    const reject = read('src/services/paymentProofRejectionService.ts');
    assert.match(reject, /cleanupRejectedBookingRequest/);
    assert.doesNotMatch(reject, /finalizeStaleBookingPaymentReview/);
    assert.doesNotMatch(reject, /isBookingPaymentProofProcessed/);
    assert.doesNotMatch(reject, /PAYMENT_ALREADY_PROCESSED_MESSAGE/);
  });

  test('confirmed booking never eligible for display', () => {
    assert.equal(isBookingCheckoutEligibleForPaymentReview('confirmed'), false);
    assert.equal(isBookingCheckoutEligibleForPaymentReview('superseded'), false);
    assert.equal(isBookingCheckoutEligibleForPaymentReview('pending_approval'), true);
  });

  test('approved record never eligible', () => {
    assert.equal(isPaymentRecordEligibleForReview('approved', true), false);
  });
});

describe('acceptance checklist mapping', () => {
  test('one review per booking after upload', () => {
    const item = (key: string, entityId: string, at: string): PendingPaymentReviewItem => ({
      key,
      kind: 'qr',
      pgId: 'pg',
      pgName: 'PG',
      residentName: 'Resident',
      phone: null,
      bookingCode: 'APG-1',
      roomNumber: '101',
      bedCode: 'A',
      paymentTypeLabel: 'New booking',
      title: 't',
      subtitle: 's',
      amountPaise: 100,
      screenshotUrl: 'x',
      entityId,
      customerId: 'c',
      bookingId: 'b1',
      expectedLines: [],
      expectedTotalPaise: 100,
      receivedPaise: 100,
      outstandingAfterApprovalPaise: 0,
      overpaidPaise: 0,
      outstandingSummary: null,
      canPartialApprove: false,
      canReject: true,
      proofSubmittedAt: at,
    });
    const one = dedupePendingPaymentReviews([
      item('qr-a', 'a', '2026-07-01T10:00:00Z'),
      item('qr-b', 'b', '2026-07-02T10:00:00Z'),
    ]);
    assert.equal(one.length, 1);
  });

  test('processed message SSOT for reject', () => {
    assert.equal(PAYMENT_ALREADY_PROCESSED_MESSAGE, 'This payment has already been processed.');
  });
});
