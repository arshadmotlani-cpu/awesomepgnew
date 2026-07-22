import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isRentDoubleCountCorruption,
  proofAmountPaiseFromReviewItem,
  resolveVerifiedProofAmountPaise,
  shouldFreezeSubmittedSnapshotOnRepair,
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
  test('proofAmountPaiseFromReviewItem prefers verified proof amount', () => {
    assert.equal(
      proofAmountPaiseFromReviewItem(
        item({
          amountPaise: 1_236_200,
          verifiedProofAmountPaise: 618_000,
          submittedAmountPaise: 1_236_200,
          receivedPaise: 1_236_200,
        }),
      ),
      618_000,
    );
  });

  test('isRentDoubleCountCorruption detects rent + expected pattern', () => {
    assert.equal(
      isRentDoubleCountCorruption({
        storedAmountPaise: 1_236_200,
        rentDuePaise: 412_000,
        expectedCheckoutPaise: 824_200,
      }),
      true,
    );
  });

  test('resolveVerifiedProofAmountPaise auto-repairs rent double-count as ambiguous', () => {
    const resolution = resolveVerifiedProofAmountPaise({
      storedAmountPaise: 1_236_200,
      proofSnapshotSubmittedPaise: null,
      rentDuePaise: 412_000,
      expectedCheckoutPaise: 824_200,
    });
    assert.equal(resolution.verifiedAmountPaise, 824_200);
    assert.equal(resolution.shouldRepairStoredAmount, true);
    assert.equal(resolution.repairReason, 'rent_double_count');
    assert.equal(resolution.isAmbiguousRepair, true);
    assert.equal(shouldFreezeSubmittedSnapshotOnRepair(resolution, null), false);
  });

  test('resolveVerifiedProofAmountPaise prefers frozen submit snapshot', () => {
    const resolution = resolveVerifiedProofAmountPaise({
      storedAmountPaise: 1_236_200,
      proofSnapshotSubmittedPaise: 618_000,
      rentDuePaise: 412_000,
      expectedCheckoutPaise: 824_200,
    });
    assert.equal(resolution.verifiedAmountPaise, 618_000);
    assert.equal(resolution.shouldRepairStoredAmount, true);
    assert.equal(resolution.repairReason, 'submitted_snapshot');
    assert.equal(resolution.isAmbiguousRepair, false);
  });

  test('resolveVerifiedProofAmountPaise leaves normal partial proof unchanged', () => {
    const resolution = resolveVerifiedProofAmountPaise({
      storedAmountPaise: 618_000,
      proofSnapshotSubmittedPaise: 618_000,
      rentDuePaise: 412_100,
      expectedCheckoutPaise: 824_200,
    });
    assert.equal(resolution.verifiedAmountPaise, 618_000);
    assert.equal(resolution.shouldRepairStoredAmount, false);
    assert.equal(resolution.repairReason, null);
    assert.equal(resolution.isAmbiguousRepair, false);
  });
});
