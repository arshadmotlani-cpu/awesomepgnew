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
    paymentTypeLabel: 'Short Stay',
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
        stayType: 'fixed_date_stay',
        bookingStatus: 'pending_payment',
        subtotalPaise: 66_000,
        discountPaise: 0,
        rentDuePaise: 66_000,
      },
      bookingContext: {
        bookingCode: 'APG-1',
        bookingType: 'Short Stay',
        pgName: 'Shanti Nagar - Awesome PG',
        roomNumber: '204',
        bedCode: 'B2',
        moveInDate: '2026-07-01',
        moveOutDate: '2026-07-03',
        duration: '2 Days',
        pricingRule: 'Daily',
        rentCalculation: 'Quoted rent for stay',
        rentAmountPaise: 66_000,
        depositPolicy: '50% deposit required',
        requiredDepositPaise: 33_000,
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
    assert.equal(b.bookingType, 'Short Stay');
    assert.equal(b.roomBed, '204 • Bed B2');
    assert.equal(b.stayDuration, '2 Days');
    assert.equal(b.roomChargesDuePaise, 66_000);
    assert.equal(b.securityDepositDuePaise, 33_000);
    assert.equal(b.totalExpectedPaise, 99_000);
    assert.equal(b.receivedPaise, 99_000);
    assert.equal(b.differencePaise, 0);
    assert.equal(b.differenceTone, 'exact');
    assert.equal(b.roomChargesPaidPaise, 0);
    assert.equal(b.depositPaidPaise, 0);
    assert.equal(b.depositRemainingPaise, 33_000);
    assert.equal(b.remainingBalancePaise, 0);
    assert.equal(b.extraReceivedPaise, 0);
  });

  test('partial payment: shows short difference without auto-split', () => {
    const item = baseItem({
      kind: 'qr',
      amountPaise: 70_000,
      expectedTotalPaise: 99_000,
      submittedAmountPaise: 70_000,
      bookingDetails: {
        moveInDate: null,
        moveOutDate: null,
        durationLabel: '2 Days',
        roomType: null,
        bedCode: 'B2',
        roomNumber: '204',
        monthlyRentPaise: null,
        depositRequiredPaise: 33_000,
        durationMode: 'fixed_stay',
        stayType: 'fixed_date_stay',
        bookingStatus: 'pending_payment',
        subtotalPaise: 66_000,
        discountPaise: 0,
        rentDuePaise: 66_000,
      },
    });

    const b = buildPaymentReviewBreakdown(item);
    assert.equal(b.differenceTone, 'short');
    assert.equal(b.differencePaise, -29_000);
    assert.equal(b.roomChargesPaidPaise, 0);
    assert.equal(b.depositPaidPaise, 0);
    assert.equal(b.remainingBalancePaise, 29_000);
  });

  test('excess payment: shows extra received', () => {
    const item = baseItem({
      kind: 'qr',
      amountPaise: 110_000,
      expectedTotalPaise: 99_000,
      submittedAmountPaise: 110_000,
      bookingDetails: {
        moveInDate: null,
        moveOutDate: null,
        durationLabel: '2 Days',
        roomType: null,
        bedCode: 'B2',
        roomNumber: '204',
        monthlyRentPaise: null,
        depositRequiredPaise: 33_000,
        durationMode: 'fixed_stay',
        stayType: 'fixed_date_stay',
        bookingStatus: 'pending_payment',
        subtotalPaise: 66_000,
        discountPaise: 0,
        rentDuePaise: 66_000,
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
    assert.equal(snap.roomChargesPaidPaise, 0);
    assert.equal(snap.securityDepositPaidPaise, 0);
    assert.equal(snap.totalAmountReceivedPaise, 99_000);
  });

  test('prior outstanding on item does not inflate expected total', () => {
    const item = baseItem({
      kind: 'qr',
      amountPaise: 511_100,
      expectedTotalPaise: 511_100,
      submittedAmountPaise: 511_100,
      bookingDetails: {
        moveInDate: null,
        moveOutDate: null,
        durationLabel: '2 Days',
        roomType: null,
        bedCode: 'B2',
        roomNumber: '204',
        monthlyRentPaise: null,
        depositRequiredPaise: 33_000,
        durationMode: 'fixed_stay',
        stayType: 'fixed_date_stay',
        bookingStatus: 'pending_payment',
        subtotalPaise: 66_000,
        discountPaise: 0,
        rentDuePaise: 66_000,
      },
      expectedLines: [
        { label: 'Rent', amountPaise: 66_000 },
        { label: 'Deposit', amountPaise: 33_000 },
        { label: 'Prior outstanding', amountPaise: 412_100 },
      ],
    });

    const b = buildPaymentReviewBreakdown(item);
    assert.equal(b.totalExpectedPaise, 99_000);
    assert.equal(b.priorOutstandingDuePaise, 0);
    assert.equal(b.differenceTone, 'excess');
  });

  test('APG corrupt proof — expected amount uses booking rent+deposit, not proof total', () => {
    const RENT = 412_100;
    const DEPOSIT = 412_100;
    const EXPECTED = RENT + DEPOSIT;
    const CORRUPT_PROOF = 1_236_200;
    const VERIFIED_PROOF = 618_000;

    const item = baseItem({
      kind: 'qr',
      amountPaise: CORRUPT_PROOF,
      verifiedProofAmountPaise: VERIFIED_PROOF,
      expectedTotalPaise: CORRUPT_PROOF,
      submittedAmountPaise: VERIFIED_PROOF,
      receivedPaise: VERIFIED_PROOF,
      bookingDetails: {
        moveInDate: null,
        moveOutDate: null,
        durationLabel: 'Monthly',
        roomType: null,
        bedCode: 'B2',
        roomNumber: '204',
        monthlyRentPaise: RENT,
        depositRequiredPaise: DEPOSIT,
        durationMode: 'monthly',
        stayType: 'monthly_stay',
        bookingStatus: 'pending_payment',
        subtotalPaise: RENT,
        discountPaise: 0,
        rentDuePaise: RENT,
      },
    });

    const b = buildPaymentReviewBreakdown(item);
    assert.equal(b.proofAmountPaise, VERIFIED_PROOF);
    assert.equal(b.totalExpectedPaise, EXPECTED);
    assert.equal(b.roomChargesDuePaise, RENT);
    assert.equal(b.securityDepositDuePaise, DEPOSIT);
    assert.notEqual(b.totalExpectedPaise, CORRUPT_PROOF);
    assert.notEqual(b.roomChargesDuePaise, CORRUPT_PROOF);
  });

  test('booking checkout without review context still avoids proof-derived expected total', () => {
    const RENT = 412_100;
    const DEPOSIT = 412_100;
    const item = baseItem({
      kind: 'qr',
      amountPaise: 1_236_200,
      verifiedProofAmountPaise: 618_000,
      expectedTotalPaise: 1_236_200,
      submittedAmountPaise: 618_000,
      receivedPaise: 618_000,
      bookingDetails: {
        moveInDate: null,
        moveOutDate: null,
        durationLabel: 'Monthly',
        roomType: null,
        bedCode: 'B2',
        roomNumber: '204',
        monthlyRentPaise: RENT,
        depositRequiredPaise: DEPOSIT,
        durationMode: 'monthly',
        stayType: 'monthly_stay',
        bookingStatus: 'pending_payment',
        subtotalPaise: RENT,
        discountPaise: 0,
        rentDuePaise: RENT,
      },
    });

    const b = buildPaymentReviewBreakdown(item);
    assert.equal(b.totalExpectedPaise, RENT + DEPOSIT);
    assert.equal(b.roomChargesDuePaise, RENT);
  });
});
