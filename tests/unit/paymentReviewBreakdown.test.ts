import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  allocationSnapshotForApproval,
  buildPaymentReviewBreakdown,
} from '@/src/lib/operations/paymentReviewBreakdown';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

function baseItem(
  overrides: Partial<PendingPaymentReviewItem> &
    Pick<PendingPaymentReviewItem, 'kind' | 'amountPaise' | 'expectedTotalPaise'>,
): PendingPaymentReviewItem {
  return {
    key: 'qr-1',
    pgId: 'pg-1',
    pgName: 'Shanti Nagar - Awesome PG',
    residentName: 'Gowtham Sankar',
    phone: null,
    bookingCode: 'APG-1',
    roomNumber: '204',
    bedCode: 'B2',
    paymentTypeLabel: 'Reservation Request',
    title: 'Reservation',
    subtitle: 'Booking checkout',
    screenshotUrl: '',
    entityId: 'pay-1',
    customerId: 'c-1',
    bookingId: 'b-1',
    expectedLines: [],
    receivedPaise: overrides.amountPaise,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: false,
    canReject: true,
    lifecycleState: 'reservation_request',
    ...overrides,
  };
}

describe('buildPaymentReviewBreakdown', () => {
  test('exact booking payment: room + deposit + zero difference', () => {
    const item = baseItem({
      kind: 'qr',
      amountPaise: 99_000,
      expectedTotalPaise: 99_000,
      submittedAmountPaise: 99_000,
      bookingDetails: {
        moveInDate: '2026-07-01',
        moveOutDate: '2026-07-03',
        durationLabel: '2 Days',
        roomType: null,
        bedCode: 'B2',
        roomNumber: '204',
        monthlyRentPaise: null,
        depositRequiredPaise: 33_000,
        durationMode: 'fixed_stay',
        stayType: null,
        bookingStatus: 'pending_payment',
        subtotalPaise: 66_000,
        discountPaise: 0,
        rentDuePaise: 66_000,
      },
      bookingPaymentReview: {
        bookingCode: 'APG-1',
        bookingTotalDuePaise: 99_000,
        amountSubmittedPaise: 99_000,
        rentDuePaise: 66_000,
        depositCashDuePaise: 33_000,
        rentPaisePaid: 66_000,
        depositPaisePaid: 33_000,
        depositDuePaise: 0,
        isFullPayment: true,
        canPartialApprove: false,
      },
    });

    const b = buildPaymentReviewBreakdown(item);
    assert.equal(b.bookingType, 'Reservation Booking');
    assert.equal(b.roomBed, '204 • Bed B2');
    assert.equal(b.stayDuration, '2 Days');
    assert.equal(b.roomChargesDuePaise, 66_000);
    assert.equal(b.securityDepositDuePaise, 33_000);
    assert.equal(b.totalExpectedPaise, 99_000);
    assert.equal(b.receivedPaise, 99_000);
    assert.equal(b.differencePaise, 0);
    assert.equal(b.differenceTone, 'exact');
    assert.equal(b.roomChargesPaidPaise, 66_000);
    assert.equal(b.depositPaidPaise, 33_000);
    assert.equal(b.depositRemainingPaise, 0);
    assert.equal(b.remainingBalancePaise, 0);
    assert.equal(b.extraReceivedPaise, 0);
  });

  test('partial payment: rent covered first, deposit short', () => {
    const item = baseItem({
      kind: 'qr',
      amountPaise: 70_000,
      expectedTotalPaise: 99_000,
      submittedAmountPaise: 70_000,
      overpaidPaise: 0,
      outstandingAfterApprovalPaise: 29_000,
      canPartialApprove: true,
      bookingPaymentReview: {
        bookingCode: 'APG-1',
        bookingTotalDuePaise: 99_000,
        amountSubmittedPaise: 70_000,
        rentDuePaise: 66_000,
        depositCashDuePaise: 33_000,
        rentPaisePaid: 66_000,
        depositPaisePaid: 4_000,
        depositDuePaise: 29_000,
        isFullPayment: false,
        canPartialApprove: true,
      },
    });

    const b = buildPaymentReviewBreakdown(item);
    assert.equal(b.differenceTone, 'short');
    assert.equal(b.differencePaise, -29_000);
    assert.equal(b.roomChargesPaidPaise, 66_000);
    assert.equal(b.depositPaidPaise, 4_000);
    assert.equal(b.depositRemainingPaise, 29_000);
    assert.equal(b.remainingBalancePaise, 29_000);
  });

  test('excess payment: shows extra received', () => {
    const item = baseItem({
      kind: 'qr',
      amountPaise: 110_000,
      expectedTotalPaise: 99_000,
      submittedAmountPaise: 110_000,
      overpaidPaise: 11_000,
      bookingPaymentReview: {
        bookingCode: 'APG-1',
        bookingTotalDuePaise: 99_000,
        amountSubmittedPaise: 110_000,
        rentDuePaise: 66_000,
        depositCashDuePaise: 33_000,
        rentPaisePaid: 66_000,
        depositPaisePaid: 33_000,
        depositDuePaise: 0,
        isFullPayment: true,
        canPartialApprove: false,
      },
    });

    const b = buildPaymentReviewBreakdown(item);
    assert.equal(b.differenceTone, 'excess');
    assert.equal(b.differencePaise, 11_000);
    assert.equal(b.extraReceivedPaise, 11_000);
    assert.equal(b.remainingBalancePaise, 0);
  });

  test('rent invoice uses invoice amount as room charges', () => {
    const item = baseItem({
      kind: 'rent',
      paymentTypeLabel: 'Rent',
      amountPaise: 12_000,
      expectedTotalPaise: 12_000,
      invoiceAmountPaise: 12_000,
      submittedAmountPaise: 12_000,
      lifecycleState: 'payment_collection',
      bookingCode: null,
    });

    const b = buildPaymentReviewBreakdown(item);
    assert.equal(b.roomChargesDuePaise, 12_000);
    assert.equal(b.securityDepositDuePaise, 0);
    assert.equal(b.roomChargesPaidPaise, 12_000);
    assert.equal(b.differenceTone, 'exact');
  });

  test('allocationSnapshotForApproval matches exact split', () => {
    const item = baseItem({
      kind: 'qr',
      amountPaise: 99_000,
      expectedTotalPaise: 99_000,
      submittedAmountPaise: 99_000,
      bookingDetails: {
        moveInDate: null,
        moveOutDate: null,
        durationLabel: '2 Days',
        roomType: null,
        bedCode: 'B2',
        roomNumber: '204',
        monthlyRentPaise: null,
        depositRequiredPaise: 33_000,
        durationMode: null,
        stayType: null,
        bookingStatus: null,
        subtotalPaise: 66_000,
        discountPaise: 0,
        rentDuePaise: 66_000,
      },
      bookingPaymentReview: {
        bookingCode: 'APG-1',
        bookingTotalDuePaise: 99_000,
        amountSubmittedPaise: 99_000,
        rentDuePaise: 66_000,
        depositCashDuePaise: 33_000,
        rentPaisePaid: 66_000,
        depositPaisePaid: 33_000,
        depositDuePaise: 0,
        isFullPayment: true,
        canPartialApprove: false,
      },
    });

    const snap = allocationSnapshotForApproval(item);
    assert.equal(snap.roomChargesPaidPaise, 66_000);
    assert.equal(snap.securityDepositPaidPaise, 33_000);
    assert.equal(snap.totalAmountReceivedPaise, 99_000);
  });
});
