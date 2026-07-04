import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { dedupeOperationsQueueItems } from '@/src/lib/operations/operationsQueueDefinition';
import { dedupePendingPaymentReviews } from '@/src/lib/operations/dedupePendingPaymentReviews';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { buildBookingPaymentExplanation } from '@/src/lib/operations/paymentExplanationView';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';

function qrItem(input: {
  key: string;
  entityId: string;
  bookingId: string;
  bookingCode: string;
  submittedAt: string;
  amountPaise?: number;
}): PendingPaymentReviewItem {
  return {
    key: input.key,
    kind: 'qr',
    pgId: 'pg-1',
    pgName: 'Test PG',
    residentName: 'Kunal Chaudhari',
    phone: null,
    bookingCode: input.bookingCode,
    roomNumber: '101',
    bedCode: 'A',
    paymentTypeLabel: 'New booking',
    title: `Kunal · Booking ${input.bookingCode}`,
    subtitle: 'Booking checkout',
    amountPaise: input.amountPaise ?? 824_200,
    screenshotUrl: 'https://example.com/proof.jpg',
    entityId: input.entityId,
    customerId: 'cust-1',
    bookingId: input.bookingId,
    expectedLines: [],
    expectedTotalPaise: input.amountPaise ?? 824_200,
    receivedPaise: input.amountPaise ?? 824_200,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: false,
    canReject: true,
    proofSubmittedAt: input.submittedAt,
  };
}

describe('dedupePendingPaymentReviews', () => {
  test('collapses duplicate booking checkout QR proofs to the newest row', () => {
    const items = dedupePendingPaymentReviews([
      qrItem({
        key: 'qr-old',
        entityId: 'pay-old',
        bookingId: 'booking-1',
        bookingCode: 'APG-1',
        submittedAt: '2026-07-01T10:00:00.000Z',
      }),
      qrItem({
        key: 'qr-new',
        entityId: 'pay-new',
        bookingId: 'booking-1',
        bookingCode: 'APG-1',
        submittedAt: '2026-07-02T10:00:00.000Z',
      }),
    ]);

    assert.equal(items.length, 1);
    assert.equal(items[0]?.key, 'qr-new');
  });

  test('keeps distinct entities even for the same resident', () => {
    const rent: PendingPaymentReviewItem = {
      ...qrItem({
        key: 'rent-1',
        entityId: 'rent-1',
        bookingId: 'booking-2',
        bookingCode: 'APG-2',
        submittedAt: '2026-07-03T10:00:00.000Z',
      }),
      kind: 'rent',
      key: 'rent-1',
      entityId: 'rent-1',
      paymentTypeLabel: 'Monthly rent',
    };
    const elec: PendingPaymentReviewItem = {
      ...qrItem({
        key: 'elec-1',
        entityId: 'elec-1',
        bookingId: 'booking-2',
        bookingCode: 'APG-2',
        submittedAt: '2026-07-03T11:00:00.000Z',
      }),
      kind: 'electricity',
      key: 'elec-1',
      entityId: 'elec-1',
      paymentTypeLabel: 'Electricity',
    };

    const items = dedupePendingPaymentReviews([rent, elec]);
    assert.equal(items.length, 2);
  });
});

describe('dedupeOperationsQueueItems waiting_for_approval', () => {
  test('collapses duplicate booking checkout approval ops rows', () => {
    const mk = (paymentReviewKey: string): UnifiedOpsItem => ({
      id: `approval-${paymentReviewKey}`,
      queue: 'waiting_for_approval',
      residentName: 'Kunal Chaudhari',
      pgName: 'Test PG',
      roomNumber: '101',
      bedCode: 'A',
      reason: 'Booking checkout',
      openHref: `/admin/operations?filter=waiting_for_approval&focus=${paymentReviewKey}`,
      openLabel: 'Review',
      bookingId: 'booking-1',
      paymentReviewKey,
    });

    const deduped = dedupeOperationsQueueItems([
      mk('qr-old'),
      mk('qr-new'),
    ]);

    assert.equal(deduped.length, 1);
    assert.equal(deduped[0]?.paymentReviewKey, 'qr-old');
  });
});

describe('buildBookingPaymentExplanation iterable safety', () => {
  test('accepts omitted prior arrays without throwing', () => {
    assert.doesNotThrow(() =>
      buildBookingPaymentExplanation({
        review: {
          bookingCode: 'APG-1',
          bookingTotalDuePaise: 100_000,
          amountSubmittedPaise: 100_000,
          rentDuePaise: 100_000,
          depositCashDuePaise: 0,
          rentPaisePaid: 100_000,
          depositPaisePaid: 0,
          depositDuePaise: 0,
          isFullPayment: true,
          canPartialApprove: false,
        },
        depositRequiredPaise: 0,
        depositCreditAppliedPaise: 0,
        priorOutstandingItems: undefined as unknown as [],
        priorBookingDeposits: undefined as unknown as [],
      }),
    );
  });
});
