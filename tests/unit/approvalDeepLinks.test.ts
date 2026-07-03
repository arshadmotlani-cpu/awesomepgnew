import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approvalSectionForReviewItem,
  buildApprovalDeepLink,
} from '../../src/lib/admin/approvalDeepLinks';
import type { PendingPaymentReviewItem } from '../../src/lib/operations/paymentReviewTypes';

function reviewItem(
  partial: Partial<PendingPaymentReviewItem> & Pick<PendingPaymentReviewItem, 'key' | 'kind'>,
): PendingPaymentReviewItem {
  return {
    pgId: 'pg-1',
    pgName: 'Test PG',
    residentName: 'Resident',
    phone: null,
    bookingCode: null,
    roomNumber: null,
    bedCode: null,
    paymentTypeLabel: 'Payment',
    title: 'Test',
    subtitle: 'Test',
    amountPaise: 100,
    screenshotUrl: 'https://example.com/proof.png',
    entityId: 'entity-1',
    customerId: 'cust-1',
    bookingId: null,
    expectedLines: [],
    expectedTotalPaise: 100,
    receivedPaise: 100,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: false,
    canReject: true,
    paymentExplanation: {
      headline: 'Test',
      lines: [],
      totalExpectedLabel: '₹1',
      receivedLabel: '₹1',
      resultLabel: '',
    },
    bookingContext: undefined,
    ...partial,
  };
}

test('maps booking checkout QR proofs to booking approval section', () => {
  const section = approvalSectionForReviewItem(
    reviewItem({ key: 'qr-1', kind: 'qr', bookingCode: 'BK-1' }),
  );
  assert.equal(section, 'booking');
});

test('builds waiting-for-approval deep links with dialog', () => {
  const href = buildApprovalDeepLink({ section: 'booking', itemKey: 'qr-abc' });
  assert.ok(href.includes('tab=waiting'));
  assert.ok(href.includes('section=booking'));
  assert.ok(href.includes('item=qr-abc'));
  assert.ok(href.includes('dialog=review'));
});
