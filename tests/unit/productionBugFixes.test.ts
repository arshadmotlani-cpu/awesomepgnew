import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { dedupePendingPaymentReviews } from '@/src/lib/operations/dedupePendingPaymentReviews';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { computeDepositRefundUnlockState } from '@/src/lib/billing/depositRefundUnlock';
import { breakdownToInvoiceLines } from '@/src/lib/billing/electricityBillBreakdownPure';
import type { ElectricityBillCalculationBreakdown } from '@/src/lib/billing/electricityBillBreakdownTypes';

function qrItem(input: {
  key: string;
  entityId: string;
  bookingId: string;
  bookingCode?: string | null;
  submittedAt: string;
}): PendingPaymentReviewItem {
  return {
    key: input.key,
    kind: 'qr',
    pgId: 'pg-1',
    pgName: 'Test PG',
    residentName: 'Resident',
    phone: null,
    bookingCode: input.bookingCode ?? null,
    roomNumber: '101',
    bedCode: 'A',
    paymentTypeLabel: 'New booking',
    title: 'Booking checkout',
    subtitle: 'Booking checkout',
    amountPaise: 100_000,
    screenshotUrl: 'https://example.com/proof.jpg',
    entityId: input.entityId,
    customerId: 'cust-1',
    bookingId: input.bookingId,
    expectedLines: [],
    expectedTotalPaise: 100_000,
    receivedPaise: 100_000,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: null,
    canPartialApprove: false,
    canReject: true,
    proofSubmittedAt: input.submittedAt,
  };
}

describe('dedupePendingPaymentReviews booking SSOT', () => {
  test('collapses duplicate QR proofs without bookingCode', () => {
    const items = dedupePendingPaymentReviews([
      qrItem({
        key: 'qr-old',
        entityId: 'pay-old',
        bookingId: 'booking-1',
        bookingCode: null,
        submittedAt: '2026-07-01T10:00:00.000Z',
      }),
      qrItem({
        key: 'qr-new',
        entityId: 'pay-new',
        bookingId: 'booking-1',
        bookingCode: 'APG-1',
        submittedAt: '2026-07-02T10:00:00.000Z',
      }),
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.key, 'qr-new');
  });
});

describe('depositRefundUnlock CASE A / CASE B', () => {
  test('CASE A — resident on bed requires move-out first', () => {
    const unlock = computeDepositRefundUnlockState({
      booking: {
        status: 'confirmed',
        durationMode: 'monthly',
        expectedCheckoutDate: null,
        createdAt: new Date('2026-01-01'),
      },
      vacating: null,
      settlement: null,
      residentRequest: null,
      hasActiveBedToday: true,
    });
    assert.equal(unlock.canRequestRefund, false);
    assert.match(unlock.lockReason ?? '', /move-out/i);
  });

  test('CASE B — admin checkout unlocks refund without move-out', () => {
    const unlock = computeDepositRefundUnlockState({
      booking: {
        status: 'completed',
        durationMode: 'monthly',
        expectedCheckoutDate: '2026-07-01',
        createdAt: new Date('2026-01-01'),
      },
      vacating: {
        id: 'vr-1',
        bookingId: 'b-1',
        customerId: 'c-1',
        status: 'completed',
        vacatingDate: '2026-07-01',
        noticeGivenDate: '2026-06-20',
        noticeCompliant: true,
        deductionPaise: 0,
        depositRefundPaise: 0,
        monthlyRentPaiseSnapshot: 120_000,
        createdAt: new Date('2026-06-20'),
      },
      settlement: { status: 'awaiting_resident_details' },
      residentRequest: null,
      hasActiveBedToday: false,
      today: '2026-07-02',
    });
    assert.equal(unlock.canRequestRefund, true);
    assert.equal(unlock.state, 'unlocked');
  });
});

describe('breakdownToInvoiceLines iterable safety', () => {
  test('handles missing checkoutCredits and previousContributions', () => {
    const breakdown = {
      roomNumber: '203',
      meter: {
        unitsConsumed: 10,
        ratePerUnitPaise: 1500,
        grossTotalPaise: 15_000,
      },
      adjustments: {
        prepaidCreditPaise: 0,
        manualCreditPaise: 0,
      },
      timeline: [],
    } as unknown as ElectricityBillCalculationBreakdown;

    assert.doesNotThrow(() => breakdownToInvoiceLines(breakdown));
  });
});
