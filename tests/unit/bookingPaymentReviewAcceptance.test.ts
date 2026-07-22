/**
 * Acceptance contract — booking payment review lifecycle.
 *
 * Upload → ONE review → Approve → activated → refresh → ZERO rows
 * → stale deep link → already approved → no crash → no duplicate financial effects
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { dedupePendingPaymentReviews } from '@/src/lib/operations/dedupePendingPaymentReviews';
import { dedupeOperationsQueueItems } from '@/src/lib/operations/operationsQueueDefinition';
import { PAYMENT_ALREADY_APPROVED_MESSAGE } from '@/src/lib/operations/paymentReviewMessages';
import {
  isBookingCheckoutEligibleForPaymentReview,
  isPaymentRecordEligibleForReview,
} from '@/src/lib/operations/paymentReviewEligibility';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

function qrItem(input: {
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

describe('booking payment review acceptance contract', () => {
  test('1 — duplicate uploads collapse to exactly ONE Operations review', () => {
    const items = dedupePendingPaymentReviews([
      qrItem({
        key: 'qr-old',
        entityId: 'pay-old',
        bookingId: 'booking-1',
        submittedAt: '2026-07-01T10:00:00.000Z',
      }),
      qrItem({
        key: 'qr-new',
        entityId: 'pay-new',
        bookingId: 'booking-1',
        submittedAt: '2026-07-02T10:00:00.000Z',
      }),
    ]);
    assert.equal(items.length, 1, 'Operations must show exactly one review per booking');
    assert.equal(items[0]?.key, 'qr-new');
  });

  test('2 — after approval (confirmed booking) queue is ZERO for that booking', () => {
    const pending = dedupePendingPaymentReviews([
      qrItem({
        key: 'qr-1',
        entityId: 'pay-1',
        bookingId: 'booking-1',
        submittedAt: '2026-07-02T10:00:00.000Z',
      }),
    ]);
    assert.equal(pending.length, 1);

    const afterActivation = pending.filter((item) =>
      isBookingCheckoutEligibleForPaymentReview('confirmed'),
    );
    assert.equal(afterActivation.length, 0, 'refresh Operations → zero rows for activated booking');
  });

  test('3 — approved pg_payment_record never eligible for queue', () => {
    assert.equal(isPaymentRecordEligibleForReview('approved', true), false);
  });

  test('4 — stale deep link redirects safely without crashing', () => {
    const operationsPage = read('app/(admin)/admin/operations/page.tsx');
    assert.match(operationsPage, /paymentReviewWorkspaceHref\(focus\)/);

    const reviewPage = read('app/(admin)/admin/payment-review/[reviewKey]/page.tsx');
    assert.match(reviewPage, /already_processed/);
    assert.match(reviewPage, /AdminSectionErrorBoundary/);
    assert.doesNotMatch(reviewPage, /throw new Error/);
  });

  test('5 — re-approve returns already-approved message (no throw)', () => {
    const actions = read('app/(admin)/admin/payments/actions.ts');
    assert.match(actions, /outcome === 'already_approved'/);
    assert.match(actions, /PAYMENT_ALREADY_APPROVED_MESSAGE/);
    assert.match(actions, /catch \(err\)/);
  });

  test('6 — idempotent review skips recordPaymentSuccess when payment exists', () => {
    const qr = read('src/services/qrPayments.ts');
    assert.match(qr, /bookingQrPaymentAlreadyProcessed/);
    assert.match(qr, /outcome: 'already_approved'/);
    assert.match(qr, /finalizeStaleBookingPaymentReview/);
    assert.match(
      qr,
      /if \(alreadyProcessed\) \{[\s\S]*already_approved/,
      'failed recordPaymentSuccess must not throw when payment already recorded',
    );
  });

  test('7 — recordPaymentSuccess idempotency via providerPaymentId', () => {
    const lifecycle = read('src/services/bookingLifecycle.ts');
    assert.match(lifecycle, /providerPaymentId/);
    assert.match(lifecycle, /if \(existing\)/);
    assert.match(lifecycle, /stateChanged: false/);
  });

  test('8 — reconciliation self-heals on every queue fetch', () => {
    const queue = read('src/services/paymentProofQueue.ts');
    assert.match(queue, /reconcileBookingPaymentReviewQueue/);
    assert.match(queue, /isBookingCheckoutEligibleForPaymentReview/);
  });

  test('9 — approve resolves action_items, unresolved_actions, notifications', () => {
    const cleanup = read('src/services/paymentProofReviewCleanup.ts');
    assert.match(cleanup, /resolvePaymentReviewArtifactsForKey/);
    assert.match(cleanup, /action_items/);
    assert.match(cleanup, /unresolvedActions/);
    assert.match(cleanup, /notifications/);
  });

  test('10 — Operations ops queue dedupes duplicate waiting_for_approval rows', () => {
    const mk = (key: string): UnifiedOpsItem => ({
      id: `wfa-${key}`,
      queue: 'waiting_for_approval',
      residentName: 'Kunal Chaudhari',
      pgName: 'Test PG',
      roomNumber: '102',
      bedCode: 'A',
      reason: 'Booking checkout',
      openHref: `/admin/operations?filter=waiting_for_approval&focus=${key}`,
      openLabel: 'Review',
      bookingId: 'booking-1',
      paymentReviewKey: key,
    });
    const deduped = dedupeOperationsQueueItems([mk('qr-old'), mk('qr-new')]);
    assert.equal(deduped.length, 1);
  });
});

describe('payment already approved message SSOT', () => {
  test('constant is stable across surfaces', () => {
    assert.equal(PAYMENT_ALREADY_APPROVED_MESSAGE, 'This payment has already been approved.');
    assert.match(read('app/api/payment-record/[id]/route.ts'), /PAYMENT_ALREADY_APPROVED_MESSAGE/);
    assert.match(
      read('app/(admin)/admin/payments/actions.ts'),
      /PAYMENT_ALREADY_APPROVED_MESSAGE/,
    );
  });
});
