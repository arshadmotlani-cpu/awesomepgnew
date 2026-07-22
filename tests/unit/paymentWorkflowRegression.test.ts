/**
 * Payment workflow regression — SSOT contracts from proof submit through refund.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { computeCheckoutRefundPreview } from '@/src/lib/billing/checkoutRefundPreview';
import { computeMoneySlice } from '@/src/lib/billing/bookingMoneyBalances';
import { splitBookingPayment } from '@/src/services/depositCollection';
import { buildPaymentReviewBreakdown } from '@/src/lib/operations/paymentReviewBreakdown';
import {
  proofAmountPaiseFromReviewItem,
  resolveVerifiedProofAmountPaise,
  shouldFreezeSubmittedSnapshotOnRepair,
} from '@/src/lib/operations/paymentReviewProofAmount';
import { suggestPaymentAllocation } from '@/src/lib/billing/bookingMoneyBalances';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

const RENT = 412_100;
const DEPOSIT = 412_100;
const EXPECTED = RENT + DEPOSIT;
const PARTIAL_PROOF = 618_000;
const PARTIAL_DEPOSIT_PAID = PARTIAL_PROOF - RENT; // ₹2,059
const PARTIAL_DEPOSIT_OUTSTANDING = DEPOSIT - PARTIAL_DEPOSIT_PAID; // ₹2,062

function booking(overrides?: Record<string, unknown>) {
  return {
    subtotalPaise: RENT,
    discountPaise: 0,
    depositPaise: DEPOSIT,
    totalPaise: EXPECTED,
    pricingSnapshot: null,
    ...overrides,
  };
}

function reviewItem(
  overrides: Partial<PendingPaymentReviewItem> & {
    bookingPaymentReview?: NonNullable<PendingPaymentReviewItem['bookingPaymentReview']>;
  },
): PendingPaymentReviewItem {
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
    verifiedProofAmountPaise: 618_000,
    screenshotUrl: '',
    entityId: 'pay-1',
    customerId: 'c-1',
    bookingId: 'b-1',
    expectedLines: [],
    expectedTotalPaise: EXPECTED,
    receivedPaise: 618_000,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: true,
    canReject: true,
    ...overrides,
  };
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('payment workflow regression', () => {
  test('Scenario A — full payment ₹8242 clears rent and deposit', () => {
    const split = splitBookingPayment(booking(), EXPECTED);
    assert.equal(split.rentPaisePaid, RENT);
    assert.equal(split.depositPaisePaid, DEPOSIT);
    assert.equal(split.depositDuePaise, 0);

    const rent = computeMoneySlice(RENT, RENT);
    const deposit = computeMoneySlice(DEPOSIT, DEPOSIT);
    assert.equal(rent.outstandingPaise, 0);
    assert.equal(deposit.outstandingPaise, 0);
  });

  test('Scenario B — partial ₹6180 then ₹2062 clears deposit outstanding', () => {
    const first = splitBookingPayment(booking(), PARTIAL_PROOF);
    assert.equal(first.rentPaisePaid, RENT);
    assert.equal(first.depositPaisePaid, PARTIAL_DEPOSIT_PAID);
    assert.equal(first.depositDuePaise, PARTIAL_DEPOSIT_OUTSTANDING);

    const afterFirstRent = computeMoneySlice(RENT, RENT);
    const afterFirstDeposit = computeMoneySlice(DEPOSIT, PARTIAL_DEPOSIT_PAID);
    assert.equal(afterFirstRent.outstandingPaise, 0);
    assert.equal(afterFirstDeposit.outstandingPaise, PARTIAL_DEPOSIT_OUTSTANDING);

    const afterSecondDeposit = computeMoneySlice(DEPOSIT, DEPOSIT);
    assert.equal(afterSecondDeposit.outstandingPaise, 0);
  });

  test('Scenario C — rent-only payment leaves deposit outstanding', () => {
    const split = splitBookingPayment(booking(), RENT);
    assert.equal(split.rentPaisePaid, RENT);
    assert.equal(split.depositPaisePaid, 0);
    assert.equal(split.depositDuePaise, DEPOSIT);

    const rent = computeMoneySlice(RENT, RENT);
    const deposit = computeMoneySlice(DEPOSIT, 0);
    assert.equal(rent.outstandingPaise, 0);
    assert.equal(deposit.outstandingPaise, DEPOSIT);
  });

  test('deposit-only allocation suggestion', () => {
    const suggestion = suggestPaymentAllocation({
      confirmedReceivedPaise: DEPOSIT,
      rentOutstandingPaise: 0,
      depositOutstandingPaise: DEPOSIT,
    });
    assert.equal(suggestion.rentAllocatedPaise, 0);
    assert.equal(suggestion.depositAllocatedPaise, DEPOSIT);
  });

  test('rent-only allocation suggestion', () => {
    const suggestion = suggestPaymentAllocation({
      confirmedReceivedPaise: RENT,
      rentOutstandingPaise: RENT,
      depositOutstandingPaise: DEPOSIT,
    });
    assert.equal(suggestion.rentAllocatedPaise, RENT);
    assert.equal(suggestion.depositAllocatedPaise, 0);
  });

  test('overpayment beyond expected checkout', () => {
    const split = splitBookingPayment(booking(), EXPECTED + 50_000);
    assert.equal(split.isFullPayment, true);
    assert.equal(split.rentPaisePaid, RENT);
    assert.equal(split.depositPaisePaid, DEPOSIT);
  });

  test('underpayment partial deposit allocation defaults', () => {
    const item = reviewItem({
      amountPaise: 618_000,
      verifiedProofAmountPaise: 618_000,
      bookingPaymentReview: {
        bookingCode: 'BK-1',
        bookingTotalDuePaise: EXPECTED,
        amountSubmittedPaise: 618_000,
        verifiedProofAmountPaise: 618_000,
        rentDuePaise: RENT,
        depositCashDuePaise: DEPOSIT,
        priorOutstandingDuePaise: 0,
        priorOutstandingItems: [],
        rentPaisePaid: RENT,
        depositPaisePaid: PARTIAL_DEPOSIT_PAID,
        depositDuePaise: PARTIAL_DEPOSIT_OUTSTANDING,
        isFullPayment: false,
        canPartialApprove: true,
        liveCheckoutTotalPaise: EXPECTED,
        proofSnapshotFrozen: true,
      },
    });
    const breakdown = buildPaymentReviewBreakdown(item);
    assert.equal(breakdown.proofAmountPaise, 618_000);
    assert.equal(breakdown.totalExpectedPaise, EXPECTED);
    assert.equal(breakdown.differencePaise, 618_000 - EXPECTED);
    assert.equal(breakdown.depositRemainingPaise, PARTIAL_DEPOSIT_OUTSTANDING);
    assert.ok(!('proofAmountCorruptionWarning' in breakdown));
  });

  test('checkout refund uses collected deposit and deducts outstanding rent only', () => {
    const collectedDeposit = 206_000;
    const preview = computeCheckoutRefundPreview({
      depositHeldPaise: collectedDeposit,
      noticeDeductionPaise: 0,
      outstandingRentAtCheckoutPaise: RENT,
    });
    assert.equal(preview.outstandingRentDeductionPaise, RENT);
    assert.equal(preview.finalRefundPaise, 0);
    assert.notEqual(preview.depositHeldPaise, DEPOSIT);
  });

  test('checkout refund after partial deposit — refund is collected not required', () => {
    const preview = computeCheckoutRefundPreview({
      depositHeldPaise: PARTIAL_DEPOSIT_PAID,
      noticeDeductionPaise: 0,
      outstandingRentAtCheckoutPaise: 0,
    });
    assert.equal(preview.finalRefundPaise, PARTIAL_DEPOSIT_PAID);
  });

  test('historical repaired row with frozen submit snapshot', () => {
    const resolution = resolveVerifiedProofAmountPaise({
      storedAmountPaise: 1_236_200,
      proofSnapshotSubmittedPaise: 618_000,
      rentDuePaise: 412_000,
      expectedCheckoutPaise: 824_200,
    });
    assert.equal(resolution.verifiedAmountPaise, 618_000);
    assert.equal(resolution.isAmbiguousRepair, false);
    assert.equal(shouldFreezeSubmittedSnapshotOnRepair(resolution, 618_000), false);
  });

  test('historical ambiguous row — rent double-count without submit snapshot', () => {
    const resolution = resolveVerifiedProofAmountPaise({
      storedAmountPaise: 1_236_200,
      proofSnapshotSubmittedPaise: null,
      rentDuePaise: 412_000,
      expectedCheckoutPaise: 824_200,
    });
    assert.equal(resolution.isAmbiguousRepair, true);
    assert.equal(resolution.verifiedAmountPaise, 824_200);
    assert.equal(shouldFreezeSubmittedSnapshotOnRepair(resolution, null), false);
  });

  test('new proof after migration always resolves from verified amount', () => {
    assert.equal(
      proofAmountPaiseFromReviewItem(
        reviewItem({
          amountPaise: 1_236_200,
          verifiedProofAmountPaise: 618_000,
        }),
      ),
      618_000,
    );
  });

  test('Payment Review workspace has no corruption or drift warnings', () => {
    const workspace = read('src/components/admin/payment-review/PaymentReviewWorkspace.tsx');
    assert.doesNotMatch(workspace, /proofAmountCorruptionWarning/);
    assert.doesNotMatch(workspace, /driftWarning/);
    assert.doesNotMatch(workspace, /Resident paid/i);
    assert.doesNotMatch(workspace, /lifetime account totals/i);
  });

  test('submit path freezes proof_snapshot_submitted_paise at upload', () => {
    const qr = read('src/services/qrPayments.ts');
    assert.match(qr, /proofSnapshotRowValues\(proofSnapshot, input\.amountPaise\)/);
    assert.match(qr, /proofSnapshotSubmittedPaise/);
    assert.match(qr, /shouldFreezeSubmittedSnapshotOnRepair/);
  });
});
