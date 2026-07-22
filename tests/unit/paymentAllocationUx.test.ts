import assert from 'node:assert/strict';
import test from 'node:test';
import type { BookingMoneyBalances } from '@/src/lib/billing/bookingMoneyBalances';
import {
  allocationIsFullyAllocated,
  allocationSummaryLines,
  buildAllocationDefaultsFromReviewItem,
  residentPaidPaiseFromReviewItem,
} from '@/src/lib/operations/paymentAllocationUx';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { validatePaymentProofAllocation } from '@/src/services/paymentProofAllocationApproval';

function balances(overrides?: Partial<BookingMoneyBalances>): BookingMoneyBalances {
  return {
    bookingId: 'b1',
    rent: { requiredPaise: 412_100, receivedPaise: 0, outstandingPaise: 412_100 },
    deposit: {
      requiredPaise: 412_100,
      receivedPaise: 0,
      outstandingPaise: 412_100,
      refundablePaise: 0,
    },
    electricity: { requiredPaise: 0, receivedPaise: 0, outstandingPaise: 0 },
    ...overrides,
  };
}

function reviewItem(
  overrides: Partial<PendingPaymentReviewItem>,
): PendingPaymentReviewItem {
  return {
    key: 'qr:1',
    kind: 'qr',
    pgId: 'pg1',
    pgName: 'Test PG',
    residentName: 'Resident',
    phone: null,
    bookingCode: 'BK1',
    roomNumber: '101',
    bedCode: 'A',
    paymentTypeLabel: 'Booking',
    title: 'Booking',
    subtitle: '',
    amountPaise: 618_000,
    screenshotUrl: '',
    entityId: 'e1',
    customerId: 'c1',
    bookingId: 'b1',
    expectedLines: [],
    expectedTotalPaise: 618_000,
    receivedPaise: 618_000,
    submittedAmountPaise: 618_000,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: false,
    canReject: true,
    bookingPaymentReview: {
      rentDuePaise: 412_000,
      depositCashDuePaise: 206_000,
      rentPaisePaid: 412_000,
      depositPaisePaid: 206_000,
      depositDuePaise: 0,
      bookingTotalDuePaise: 618_000,
      amountSubmittedPaise: 618_000,
      canPartialApprove: false,
    },
    ...overrides,
  };
}

test('buildAllocationDefaultsFromReviewItem splits this proof rent then deposit', () => {
  const defaults = buildAllocationDefaultsFromReviewItem(reviewItem({}));
  assert.equal(defaults.confirmedReceivedPaise, 618_000);
  assert.equal(defaults.rentAllocatedPaise, 412_000);
  assert.equal(defaults.depositAllocatedPaise, 206_000);
});

test('buildAllocationDefaultsFromReviewItem prefills rent invoice payments to rent', () => {
  const defaults = buildAllocationDefaultsFromReviewItem(
    reviewItem({ kind: 'rent', bookingPaymentReview: undefined, amountPaise: 50_000, submittedAmountPaise: 50_000 }),
  );
  assert.equal(defaults.rentAllocatedPaise, 50_000);
  assert.equal(defaults.depositAllocatedPaise, 0);
});

test('allocationIsFullyAllocated requires exact match', () => {
  assert.equal(
    allocationIsFullyAllocated({
      confirmedReceivedPaise: 618_000,
      rentAllocatedPaise: 412_000,
      depositAllocatedPaise: 206_000,
      electricityAllocatedPaise: 0,
      otherAllocatedPaise: 0,
    }),
    true,
  );
  assert.equal(
    allocationIsFullyAllocated({
      confirmedReceivedPaise: 618_000,
      rentAllocatedPaise: 412_000,
      depositAllocatedPaise: 200_000,
      electricityAllocatedPaise: 0,
      otherAllocatedPaise: 0,
    }),
    false,
  );
});

test('validatePaymentProofAllocation rejects partial allocation', () => {
  const result = validatePaymentProofAllocation({
    confirmedReceivedPaise: 618_000,
    rentAllocatedPaise: 412_000,
    depositAllocatedPaise: 200_000,
    electricityAllocatedPaise: 0,
    otherAllocatedPaise: 0,
  });
  assert.equal(result.ok, false);
});

test('residentPaidPaiseFromReviewItem uses proof row amount', () => {
  assert.equal(
    residentPaidPaiseFromReviewItem(reviewItem({ submittedAmountPaise: 700_000, amountPaise: 618_000 })),
    618_000,
  );
});

test('allocationSummaryLines lists non-zero slices', () => {
  const lines = allocationSummaryLines({
    confirmedReceivedPaise: 618_000,
    rentAllocatedPaise: 618_000,
    depositAllocatedPaise: 0,
    electricityAllocatedPaise: 0,
    otherAllocatedPaise: 0,
  });
  assert.deepEqual(lines, [{ label: 'Rent', amountPaise: 618_000 }]);
});
