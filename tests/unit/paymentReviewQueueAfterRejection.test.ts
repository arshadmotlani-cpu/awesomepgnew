import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { isRentInvoiceAwaitingPaymentReview } from '@/src/lib/operations/paymentReviewQueueEligibility';
import { applyUnifiedOperationsFilter } from '@/src/services/unifiedOperationsQueue';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';

function rentReview(entityId: string): PendingPaymentReviewItem {
  return {
    key: `rent-${entityId}`,
    kind: 'rent',
    pgId: 'pg-1',
    pgName: 'Test PG',
    residentName: 'Disha Rangari',
    phone: null,
    bookingCode: 'APG-TEST',
    roomNumber: '101',
    bedCode: 'A',
    paymentTypeLabel: 'Monthly rent',
    title: 'Disha · Rent',
    subtitle: 'Room 101',
    amountPaise: 500_000,
    screenshotUrl: '',
    referenceNumber: '624462640999',
    entityId,
    customerId: 'cust-1',
    bookingId: 'booking-1',
    expectedLines: [{ label: 'Amount due', amountPaise: 500_000 }],
    expectedTotalPaise: 500_000,
    receivedPaise: null,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: 'Verify transaction ID',
    canPartialApprove: false,
    canReject: true,
    proofSubmittedAt: '2026-09-02T02:05:00.000Z',
    billingMonth: '2026-09-01',
  };
}

describe('payment review queue after rejection SSOT', () => {
  test('active rejection excludes invoice from awaiting review', () => {
    assert.equal(
      isRentInvoiceAwaitingPaymentReview({
        status: 'payment_in_progress',
        paymentProofUrl: null,
        paymentProofTransactionRef: '624462640999',
        hasActiveRejection: true,
      }),
      false,
    );
  });

  test('cleared proof after rejection is not awaiting review', () => {
    assert.equal(
      isRentInvoiceAwaitingPaymentReview({
        status: 'pending',
        paymentProofUrl: null,
        paymentProofTransactionRef: null,
        hasActiveRejection: true,
      }),
      false,
    );
  });

  test('new resubmission after superseded rejection can await review', () => {
    assert.equal(
      isRentInvoiceAwaitingPaymentReview({
        status: 'payment_in_progress',
        paymentProofUrl: null,
        paymentProofTransactionRef: '624462641000',
        hasActiveRejection: false,
      }),
      true,
    );
  });

  test('rejectPaymentProof clears transaction ID for all proof entity types', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/paymentProofRejectionService.ts'),
      'utf8',
    );
    assert.match(src, /paymentProofTransactionRef: null/);
    assert.match(src, /transactionRef: null/);
    assert.match(src, /case 'rent_invoice':[\s\S]*paymentProofTransactionRef: null/);
    assert.match(src, /case 'electricity_invoice':[\s\S]*paymentProofTransactionRef: null/);
    assert.match(src, /case 'payment_link':[\s\S]*paymentProofTransactionRef: null/);
    assert.match(src, /case 'stay_extension':[\s\S]*paymentProofTransactionRef: null/);
  });

  test('list queries exclude active rejections', () => {
    for (const file of [
      'src/services/rentInvoices.ts',
      'src/services/meterElectricity.ts',
      'src/services/extension.ts',
      'src/services/residentCharges.ts',
      'src/services/qrPayments.ts',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      assert.match(src, /WithoutActiveRejectionSql/, `${file} must exclude active rejections`);
    }
  });

  test('operations waiting table excludes rejected review not in active queue items', () => {
    const entityId = 'inv-rejected';
    const base = {
      allItems: [] as UnifiedOpsItem[],
      paymentReviews: [rentReview(entityId)],
      filterCounts: [],
    };
    const queue = applyUnifiedOperationsFilter(base, 'waiting_for_approval', null);
    assert.equal(queue.paymentReviews.length, 0);
    assert.equal(queue.filterCounts.find((f) => f.id === 'waiting_for_approval')?.count ?? 0, 0);
  });

  test('queue load reconciles rejected proof ghosts', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/paymentProofQueue.ts'),
      'utf8',
    );
    assert.match(src, /reconcileRejectedProofQueueGhosts/);
  });
});
