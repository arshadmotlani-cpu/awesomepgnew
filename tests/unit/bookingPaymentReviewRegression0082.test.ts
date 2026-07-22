import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { breakdownBookingCheckoutPayment } from '@/src/lib/billing/bookingCheckoutTotals';
import {
  buildBookingPaymentVerificationAudit,
  expectedContractPaiseFromBooking,
} from '@/src/lib/billing/bookingPaymentVerificationAudit';
import {
  buildPaymentReviewVerification,
  screenshotAmountPaiseFromProof,
} from '@/src/lib/operations/paymentReviewVerification';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

const RENT = 412_100;
const DEPOSIT = 412_100;
const EXPECTED = RENT + DEPOSIT;
const SCREENSHOT = 618_000;
const CORRUPT = 1_236_200;

function apg0082Item(
  overrides?: Partial<PendingPaymentReviewItem>,
): PendingPaymentReviewItem {
  return {
    key: 'qr-0082',
    kind: 'qr',
    pgId: 'pg-1',
    pgName: 'PG',
    residentName: 'Resident',
    phone: null,
    bookingCode: 'APG-2026-0082',
    roomNumber: '204',
    bedCode: 'B2',
    paymentTypeLabel: 'Monthly Stay',
    title: 'Review',
    subtitle: '',
    amountPaise: SCREENSHOT,
    screenshotUrl: '',
    entityId: 'proof-0082',
    customerId: 'cust-1',
    bookingId: 'booking-0082',
    expectedLines: [],
    expectedTotalPaise: EXPECTED,
    receivedPaise: SCREENSHOT,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: false,
    canReject: true,
    submittedAmountPaise: SCREENSHOT,
    bookingDetails: {
      moveInDate: '2026-07-21',
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
    ...overrides,
  };
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('APG-2026-0082 regression bookings', () => {
  test('payment review expected is rent + deposit, never corrupt proof', () => {
    const corrupt = apg0082Item({
      amountPaise: CORRUPT,
      submittedAmountPaise: CORRUPT,
    });
    const review = buildPaymentReviewVerification(corrupt);
    assert.equal(review.expectedPaymentPaise, EXPECTED);
    assert.notEqual(review.expectedPaymentPaise, CORRUPT);
  });

  test('payment review screenshot resolves admin-corrected amount over corrupt submitted', () => {
    const corrected = apg0082Item({
      amountPaise: SCREENSHOT,
      submittedAmountPaise: CORRUPT,
    });
    assert.equal(screenshotAmountPaiseFromProof(corrected), SCREENSHOT);
    const review = buildPaymentReviewVerification(corrected);
    assert.equal(review.screenshotAmountPaise, SCREENSHOT);
    assert.equal(review.differencePaise, EXPECTED - SCREENSHOT);
    assert.equal(review.differenceTone, 'short');
  });

  test('duplicate corrupt booking fixture behaves identically', () => {
    const second = apg0082Item({
      bookingCode: 'APG-2026-0082-B',
      key: 'qr-second',
      entityId: 'proof-second',
      bookingId: 'booking-second',
      amountPaise: SCREENSHOT,
      submittedAmountPaise: CORRUPT,
    });
    const review = buildPaymentReviewVerification(second);
    assert.equal(review.expectedPaymentPaise, EXPECTED);
    assert.equal(review.screenshotAmountPaise, SCREENSHOT);
    assert.equal(review.differencePaise, EXPECTED - SCREENSHOT);
  });

  test('approve path uses contract rent+deposit, not screenshot or corrupt proof', () => {
    const qr = read('src/services/qrPayments.ts');
    const start = qr.indexOf('if (opts?.verificationOnly)');
    assert.ok(start >= 0);
    const end = qr.indexOf('} else {', start);
    assert.ok(end > start);
    const verifyBlock = qr.slice(start, end);
    assert.match(verifyBlock, /amountPaise: contractAmountPaise/);
    assert.match(verifyBlock, /rentDuePaise \+ checkoutBreakdown\.depositCashDuePaise/);
    assert.match(verifyBlock, /screenshotAmountPaise/);
    assert.doesNotMatch(verifyBlock, /deferFinancialAllocation/);
    assert.doesNotMatch(verifyBlock, /paymentAllocation/);
  });

  test('booking audit section is read-only contract vs screenshot', () => {
    const audit = buildBookingPaymentVerificationAudit({
      recordId: 'proof-0082',
      status: 'approved',
      booking: {
        subtotalPaise: RENT,
        discountPaise: 0,
        depositPaise: DEPOSIT,
        pricingSnapshot: null,
      },
      proofRecord: {
        proofSnapshotSubmittedPaise: SCREENSHOT,
        confirmedAmountPaise: SCREENSHOT,
        amountPaise: CORRUPT,
        paymentScreenshotUrl: 'https://example.com/proof.jpg',
      },
    });
    assert.ok(audit);
    assert.equal(audit?.expectedContractPaise, EXPECTED);
    assert.equal(audit?.screenshotAmountPaise, SCREENSHOT);
    assert.equal(audit?.differencePaise, EXPECTED - SCREENSHOT);
    assert.equal(audit?.status, 'approved');
    assert.equal(audit?.hasScreenshot, true);
  });

  test('contract expected matches breakdown rent + deposit cash due', () => {
    const expected = expectedContractPaiseFromBooking({
      subtotalPaise: RENT,
      discountPaise: 0,
      depositPaise: DEPOSIT,
      pricingSnapshot: null,
    });
    const breakdown = breakdownBookingCheckoutPayment({
      subtotalPaise: RENT,
      discountPaise: 0,
      depositPaise: DEPOSIT,
      pricingSnapshot: null,
    });
    assert.equal(expected, breakdown.rentDuePaise + breakdown.depositCashDuePaise);
    assert.equal(expected, EXPECTED);
  });
});
