import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isRentInvoiceAwaitingPaymentReview,
  proofApprovalProviderPaymentId,
} from '@/src/lib/operations/paymentReviewQueueEligibility';
import { isPaymentRecordEligibleForReview } from '@/src/lib/operations/paymentReviewSsot';
import { applyUnifiedOperationsFilter } from '@/src/services/unifiedOperationsQueue';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';

function rentReview(entityId: string, residentName: string): PendingPaymentReviewItem {
  return {
    key: `rent-${entityId}`,
    kind: 'rent',
    pgId: 'pg-1',
    pgName: 'Test PG',
    residentName,
    phone: null,
    bookingCode: 'APG-TEST',
    roomNumber: '101',
    bedCode: 'A',
    paymentTypeLabel: 'Monthly rent',
    title: `${residentName} · Rent`,
    subtitle: 'Room 101',
    amountPaise: 302_100,
    screenshotUrl: '',
    referenceNumber: '624462640131',
    entityId,
    customerId: 'cust-1',
    bookingId: 'booking-1',
    expectedLines: [{ label: 'Amount due', amountPaise: 302_100 }],
    expectedTotalPaise: 302_100,
    receivedPaise: null,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: 'Verify transaction ID',
    canPartialApprove: false,
    canReject: true,
    proofSubmittedAt: '2026-09-01T18:16:00.000Z',
    billingMonth: '2026-09-01',
  };
}

function waitingOpsItem(reviewKey: string, residentName: string): UnifiedOpsItem {
  return {
    id: `approval-${reviewKey}`,
    queue: 'waiting_for_approval',
    residentName,
    pgName: 'Test PG',
    roomNumber: '101',
    bedCode: 'A',
    reason: 'Monthly rent',
    openHref: `/admin/operations?filter=waiting_for_approval&focus=${reviewKey}`,
    openLabel: 'Review',
    paymentReviewKey: reviewKey,
    amountPaise: 302_100,
    paymentType: 'Monthly rent',
  };
}

describe('payment review queue after approval SSOT', () => {
  test('txn-only proof awaiting review when not yet settled', () => {
    assert.equal(
      isRentInvoiceAwaitingPaymentReview({
        status: 'payment_in_progress',
        paymentProofUrl: null,
        paymentProofTransactionRef: '624462640131',
        hasSucceededProofPayment: false,
      }),
      true,
    );
  });

  test('already-settled proof is never awaiting review', () => {
    assert.equal(
      isRentInvoiceAwaitingPaymentReview({
        status: 'payment_in_progress',
        paymentProofUrl: null,
        paymentProofTransactionRef: '624462640131',
        hasSucceededProofPayment: true,
      }),
      false,
    );
    assert.equal(
      isRentInvoiceAwaitingPaymentReview({
        status: 'paid',
        paymentProofUrl: null,
        paymentProofTransactionRef: '624462640131',
        hasSucceededProofPayment: false,
      }),
      false,
    );
  });

  test('proof approval provider payment id is stable per invoice', () => {
    assert.equal(proofApprovalProviderPaymentId('rent', 'inv-1'), 'rent-proof-inv-1');
    assert.equal(proofApprovalProviderPaymentId('electricity', 'inv-2'), 'qr-proof-inv-2');
    assert.equal(proofApprovalProviderPaymentId('extension', 'ext-1'), 'extension-proof-ext-1');
  });

  test('approved pg payment record never re-enters queue', () => {
    assert.equal(isPaymentRecordEligibleForReview('approved', true), false);
  });

  test('operations waiting_for_approval table matches deduped queue items only', () => {
    const settledId = 'inv-settled';
    const pendingId = 'inv-pending';
    const base = {
      allItems: [
        waitingOpsItem(`rent-${pendingId}`, 'Resident A'),
      ],
      paymentReviews: [rentReview(pendingId, 'Resident A'), rentReview(settledId, 'Resident B')],
      filterCounts: [],
    };

    const queue = applyUnifiedOperationsFilter(base, 'waiting_for_approval', null);
    assert.equal(queue.paymentReviews.length, 1);
    assert.equal(queue.paymentReviews[0]?.entityId, pendingId);
    assert.equal(queue.filterCounts.find((f) => f.id === 'waiting_for_approval')?.count ?? 0, 1);
  });

  test('idempotent second approval cannot recreate queue item when settled flag set', () => {
    assert.equal(
      isRentInvoiceAwaitingPaymentReview({
        status: 'payment_in_progress',
        paymentProofTransactionRef: '624462640131',
        hasSucceededProofPayment: true,
      }),
      false,
      'settled payment must drop invoice from awaiting review',
    );
  });

  test('rejected workflow — active rejection is not awaiting', () => {
    assert.equal(
      isRentInvoiceAwaitingPaymentReview({
        status: 'payment_in_progress',
        paymentProofUrl: null,
        paymentProofTransactionRef: '624462640131',
        hasActiveRejection: true,
      }),
      false,
    );
  });

  test('rejected workflow — pending without proof is not awaiting', () => {
    assert.equal(
      isRentInvoiceAwaitingPaymentReview({
        status: 'pending',
        paymentProofUrl: null,
        paymentProofTransactionRef: null,
        hasSucceededProofPayment: false,
      }),
      false,
    );
  });
});
