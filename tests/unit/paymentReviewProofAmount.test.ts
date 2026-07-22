import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  detectProofAmountCorruption,
  proofAmountPaiseFromReviewItem,
} from '@/src/lib/operations/paymentReviewProofAmount';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

function item(overrides: Partial<PendingPaymentReviewItem>): PendingPaymentReviewItem {
  return {
    key: 'qr-1',
    kind: 'qr',
    pgId: 'pg-1',
    pgName: 'PG',
    residentName: 'Resident',
    phone: null,
    bookingCode: 'BK-1',
    roomNumber: '101',
    bedCode: 'A',
    paymentTypeLabel: 'New stay',
    title: 'Review',
    subtitle: '',
    amountPaise: 618_000,
    screenshotUrl: '',
    entityId: 'pay-1',
    customerId: 'c-1',
    bookingId: 'b-1',
    expectedLines: [],
    expectedTotalPaise: 824_200,
    receivedPaise: 618_000,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: true,
    canReject: true,
    ...overrides,
  };
}

describe('paymentReviewProofAmount', () => {
  test('proofAmountPaiseFromReviewItem uses entity amount only', () => {
    assert.equal(
      proofAmountPaiseFromReviewItem(
        item({ amountPaise: 618_000, submittedAmountPaise: 1_236_200, receivedPaise: 1_236_200 }),
      ),
      618_000,
    );
  });

  test('detectProofAmountCorruption flags rent double-count pattern', () => {
    const warning = detectProofAmountCorruption({
      proofAmountPaise: 1_236_200,
      rentDuePaise: 412_000,
      depositDuePaise: 412_000,
      expectedCheckoutPaise: 824_200,
    });
    assert.match(warning ?? '', /double-counted|rent plus expected/i);
  });

  test('detectProofAmountCorruption silent for normal partial proof', () => {
    assert.equal(
      detectProofAmountCorruption({
        proofAmountPaise: 618_000,
        rentDuePaise: 412_100,
        depositDuePaise: 412_100,
        expectedCheckoutPaise: 824_200,
      }),
      null,
    );
  });
});
