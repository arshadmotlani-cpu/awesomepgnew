import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isRentDoubleCountCorruption,
  proofAmountPaiseFromReviewItem,
  resolveVerifiedProofAmountPaise,
  shouldApplyProofAmountSelfHeal,
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
  test('proofAmountPaiseFromReviewItem uses raw submitted snapshot', () => {
    assert.equal(
      proofAmountPaiseFromReviewItem(
        item({
          amountPaise: 1_236_200,
          verifiedProofAmountPaise: 618_000,
          submittedAmountPaise: 618_000,
          receivedPaise: 1_236_200,
        }),
      ),
      618_000,
    );
  });

  test('proofAmountPaiseFromReviewItem falls back to amountPaise when no snapshot', () => {
    assert.equal(
      proofAmountPaiseFromReviewItem(
        item({
          amountPaise: 618_000,
          verifiedProofAmountPaise: 618_000,
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

  test('APG-2026-0082 — corrupt submitted double-count is not trusted for display', () => {
    const resolution = resolveVerifiedProofAmountPaise({
      storedAmountPaise: 1_236_200,
      proofSnapshotSubmittedPaise: 1_236_200,
      rentDuePaise: 412_100,
      expectedCheckoutPaise: 824_200,
    });
    assert.notEqual(resolution.verifiedAmountPaise, 1_236_200);
    assert.equal(resolution.verifiedAmountPaise, 824_100);
    assert.equal(resolution.isAmbiguousRepair, true);
  });

  test('APG-2026-0082 — admin-corrected amount_paise wins over corrupt submitted snapshot', () => {
    const resolution = resolveVerifiedProofAmountPaise({
      storedAmountPaise: 618_000,
      proofSnapshotSubmittedPaise: 1_236_200,
      rentDuePaise: 412_100,
      expectedCheckoutPaise: 824_200,
    });
    assert.equal(resolution.verifiedAmountPaise, 618_000);
    assert.equal(resolution.shouldRepairStoredAmount, false);
    assert.equal(resolution.shouldRepairSubmittedSnapshot, true);
    assert.equal(resolution.repairReason, 'admin_correction');
  });

  test('shouldApplyProofAmountSelfHeal does not revert admin correction toward corrupt submitted', () => {
    const resolution = resolveVerifiedProofAmountPaise({
      storedAmountPaise: 618_000,
      proofSnapshotSubmittedPaise: 1_236_200,
      rentDuePaise: 412_100,
      expectedCheckoutPaise: 824_200,
    });
    assert.equal(
      shouldApplyProofAmountSelfHeal({
        resolution,
        storedAmountPaise: 618_000,
        proofSnapshotSubmittedPaise: 1_236_200,
        expectedCheckoutPaise: 824_200,
        rentDuePaise: 412_100,
      }),
      true,
    );
    const revertResolution = {
      verifiedAmountPaise: 1_236_200,
      shouldRepairStoredAmount: true,
      shouldRepairSubmittedSnapshot: false,
      repairReason: 'submitted_snapshot' as const,
      isAmbiguousRepair: false,
    };
    assert.equal(
      shouldApplyProofAmountSelfHeal({
        resolution: revertResolution,
        storedAmountPaise: 618_000,
        proofSnapshotSubmittedPaise: 1_236_200,
        expectedCheckoutPaise: 824_200,
        rentDuePaise: 412_100,
      }),
      false,
    );
  });
});
