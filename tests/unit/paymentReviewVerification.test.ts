import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildPaymentReviewVerification,
  depositRequiredPaiseFromBooking,
  expectedPaymentPaiseFromBooking,
  monthlyRentPaiseFromBooking,
  screenshotAmountPaiseFromProof,
} from '@/src/lib/operations/paymentReviewVerification';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

function baseItem(
  overrides: Partial<PendingPaymentReviewItem> &
    Pick<PendingPaymentReviewItem, 'kind' | 'amountPaise' | 'expectedTotalPaise'>,
): PendingPaymentReviewItem {
  return {
    key: 'qr-1',
    pgId: 'pg-1',
    pgName: 'Test PG',
    residentName: 'Resident',
    phone: null,
    bookingCode: 'APG-2026-0082',
    roomNumber: '204',
    bedCode: 'B2',
    paymentTypeLabel: 'Monthly Stay',
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

describe('paymentReviewVerification SSOT', () => {
  test('expected = monthly rent + deposit only (APG-2026-0082 regression)', () => {
    const RENT = 412_100;
    const DEPOSIT = 412_100;
    const item = baseItem({
      kind: 'qr',
      amountPaise: 1_236_200,
      expectedTotalPaise: 1_236_200,
      submittedAmountPaise: 618_000,
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

    assert.equal(monthlyRentPaiseFromBooking(item), RENT);
    assert.equal(depositRequiredPaiseFromBooking(item), DEPOSIT);
    assert.equal(expectedPaymentPaiseFromBooking(item), RENT + DEPOSIT);
    assert.notEqual(expectedPaymentPaiseFromBooking(item), item.amountPaise);
    assert.notEqual(expectedPaymentPaiseFromBooking(item), item.submittedAmountPaise);
  });

  test('buildPaymentReviewVerification never mixes proof into expected', () => {
    const RENT = 412_100;
    const DEPOSIT = 412_100;
    const item = baseItem({
      kind: 'qr',
      amountPaise: 1_236_200,
      expectedTotalPaise: 1_236_200,
      submittedAmountPaise: 618_000,
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

    const v = buildPaymentReviewVerification(item);
    assert.equal(v.expectedPaymentPaise, RENT + DEPOSIT);
    assert.equal(v.screenshotAmountPaise, 618_000);
    assert.equal(v.receivedPaise, 618_000);
    assert.equal(v.differencePaise, RENT + DEPOSIT - 618_000);
    assert.equal(v.differenceTone, 'short');
  });

  test('APG-2026-0082 — admin-corrected amount wins over corrupt submitted snapshot', () => {
    const RENT = 412_100;
    const DEPOSIT = 412_100;
    const item = baseItem({
      kind: 'qr',
      amountPaise: 618_000,
      expectedTotalPaise: RENT + DEPOSIT,
      submittedAmountPaise: 1_236_200,
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

    assert.equal(screenshotAmountPaiseFromProof(item), 618_000);
    const v = buildPaymentReviewVerification(item);
    assert.equal(v.expectedPaymentPaise, RENT + DEPOSIT);
    assert.equal(v.screenshotAmountPaise, 618_000);
    assert.equal(v.differencePaise, RENT + DEPOSIT - 618_000);
  });
});
