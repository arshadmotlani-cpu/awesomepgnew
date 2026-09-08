import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildPaymentReviewBookingPricingDisplay,
  isShortStayPaymentReviewBooking,
  resolvePaymentReviewStayDays,
} from '@/src/lib/operations/paymentReviewBookingPricingDisplay';
import { monthlyRentPaiseFromBooking } from '@/src/lib/operations/paymentReviewVerification';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

const SHORT_STAY_RENT = 132_000;
const SHORT_STAY_DEPOSIT = 66_000;
const MONTHLY_RENT = 412_100;
const MONTHLY_DEPOSIT = 412_100;

function shortStayItem(): PendingPaymentReviewItem {
  return {
    key: 'qr-0106',
    kind: 'qr',
    pgId: 'pg-1',
    pgName: 'Awesome PG',
    residentName: 'Short Stay Guest',
    phone: null,
    bookingCode: 'APG-2026-0106',
    roomNumber: '101',
    bedCode: 'B1',
    paymentTypeLabel: 'Short Stay',
    title: 'Reservation',
    subtitle: 'Booking checkout',
    screenshotUrl: '',
    entityId: 'pay-0106',
    customerId: 'c-1',
    bookingId: 'b-0106',
    expectedLines: [],
    amountPaise: SHORT_STAY_RENT + SHORT_STAY_DEPOSIT,
    expectedTotalPaise: SHORT_STAY_RENT + SHORT_STAY_DEPOSIT,
    receivedPaise: SHORT_STAY_RENT + SHORT_STAY_DEPOSIT,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: false,
    canReject: true,
    lifecycleState: 'reservation_request',
    bookingDetails: {
      moveInDate: '2026-09-08',
      moveOutDate: '2026-09-11',
      durationLabel: 'Fixed stay',
      roomType: null,
      bedCode: 'B1',
      roomNumber: '101',
      monthlyRentPaise: null,
      depositRequiredPaise: SHORT_STAY_DEPOSIT,
      durationMode: 'fixed_stay',
      stayType: 'fixed_date_stay',
      bookingStatus: 'pending_payment',
      subtotalPaise: SHORT_STAY_RENT,
      discountPaise: 0,
      rentDuePaise: SHORT_STAY_RENT,
      rentLineItems: [
        {
          kind: 'daily_nights',
          description: '3 days',
          units: 3,
          unitPricePaise: 44_000,
          amountPaise: SHORT_STAY_RENT,
        },
      ],
    },
  };
}

function monthlyItem(): PendingPaymentReviewItem {
  return {
    key: 'qr-monthly',
    kind: 'qr',
    pgId: 'pg-1',
    pgName: 'Test PG',
    residentName: 'Monthly Guest',
    phone: null,
    bookingCode: 'APG-2026-0082',
    roomNumber: '204',
    bedCode: 'B2',
    paymentTypeLabel: 'Monthly Stay',
    title: 'Reservation',
    subtitle: 'Booking checkout',
    screenshotUrl: '',
    entityId: 'pay-m',
    customerId: 'c-2',
    bookingId: 'b-m',
    expectedLines: [],
    amountPaise: MONTHLY_RENT + MONTHLY_DEPOSIT,
    expectedTotalPaise: MONTHLY_RENT + MONTHLY_DEPOSIT,
    receivedPaise: MONTHLY_RENT + MONTHLY_DEPOSIT,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: false,
    canReject: true,
    lifecycleState: 'reservation_request',
    bookingDetails: {
      moveInDate: '2026-09-08',
      moveOutDate: null,
      durationLabel: 'Monthly',
      roomType: null,
      bedCode: 'B2',
      roomNumber: '204',
      monthlyRentPaise: MONTHLY_RENT,
      depositRequiredPaise: MONTHLY_DEPOSIT,
      durationMode: 'monthly',
      stayType: 'monthly_stay',
      bookingStatus: 'pending_payment',
      subtotalPaise: MONTHLY_RENT,
      discountPaise: 0,
      rentDuePaise: MONTHLY_RENT,
    },
  };
}

describe('paymentReviewBookingPricingDisplay', () => {
  test('short-stay booking is detected from durationMode / stayType', () => {
    assert.equal(
      isShortStayPaymentReviewBooking({
        durationMode: 'fixed_stay',
        stayType: 'fixed_date_stay',
      }),
      true,
    );
    assert.equal(
      isShortStayPaymentReviewBooking({
        durationMode: 'monthly',
        stayType: 'monthly_stay',
      }),
      false,
    );
  });

  test('stay duration uses checkout diffDays SSOT (8 Sep → 11 Sep = 3 days)', () => {
    assert.equal(resolvePaymentReviewStayDays('2026-09-08', '2026-09-11'), 3);
  });

  test('APG-2026-0106 short-stay payment review shows dates, duration, and short-stay rent', () => {
    const item = shortStayItem();
    const rentPaise = monthlyRentPaiseFromBooking(item);
    assert.equal(rentPaise, SHORT_STAY_RENT);

    const display = buildPaymentReviewBookingPricingDisplay({
      rentPaise,
      depositPaise: SHORT_STAY_DEPOSIT,
      bookingDetails: item.bookingDetails,
    });

    assert.equal(display.kind, 'short_stay');
    const labels = display.rows.map((row) => row.label);
    assert.deepEqual(labels, [
      'Stay period',
      'Stay duration',
      'Short-stay rent',
      'Deposit',
    ]);
    assert.match(display.rows[0]!.value, /8 September 2026/);
    assert.match(display.rows[0]!.value, /11 September 2026/);
    assert.equal(display.rows[1]!.value, '3 days');
    assert.equal(display.rows[2]!.value, '₹1,320');
    assert.match(display.rows[2]!.detail ?? '', /3 days × ₹440 = ₹1,320/);
    assert.equal(display.rows[3]!.value, '₹660');
  });

  test('monthly booking still shows Monthly rent', () => {
    const item = monthlyItem();
    const rentPaise = monthlyRentPaiseFromBooking(item);
    const display = buildPaymentReviewBookingPricingDisplay({
      rentPaise,
      depositPaise: MONTHLY_DEPOSIT,
      bookingDetails: item.bookingDetails,
    });

    assert.equal(display.kind, 'monthly');
    assert.deepEqual(
      display.rows.map((row) => row.label),
      ['Move-in', 'Monthly rent', 'Deposit'],
    );
    assert.equal(display.rows[1]!.value, '₹4,121');
    assert.equal(display.rows[2]!.value, '₹4,121');
  });

  test('displayed rent matches booking pricing SSOT subtotal − discount', () => {
    const item = shortStayItem();
    const rentPaise = monthlyRentPaiseFromBooking(item);
    const display = buildPaymentReviewBookingPricingDisplay({
      rentPaise,
      depositPaise: item.bookingDetails!.depositRequiredPaise!,
      bookingDetails: item.bookingDetails,
    });
    const shortStayRow = display.rows.find((row) => row.label === 'Short-stay rent');
    assert.equal(shortStayRow?.value, '₹1,320');
    assert.equal(rentPaise, item.bookingDetails!.rentDuePaise);
  });
});
