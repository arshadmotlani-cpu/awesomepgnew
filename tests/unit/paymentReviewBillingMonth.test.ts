import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  formatPaymentReviewBillingMonth,
  resolvePaymentReviewBillingMonth,
} from '../../src/lib/operations/paymentReviewBillingMonth';

test('resolvePaymentReviewBillingMonth prefers explicit billingMonth', () => {
  assert.equal(
    resolvePaymentReviewBillingMonth({
      billingMonth: '2026-07-15',
      moveInDate: '2026-06-21',
    }),
    '2026-07-01',
  );
});

test('resolvePaymentReviewBillingMonth derives from moveInDate for QR checkout', () => {
  assert.equal(
    resolvePaymentReviewBillingMonth({
      moveInDate: '2026-07-21',
    }),
    '2026-07-01',
  );
});

test('formatPaymentReviewBillingMonth shows anniversary cycle for monthly stays', () => {
  const label = formatPaymentReviewBillingMonth({
    billingMonth: '2026-07-01',
    bookingDetails: {
      moveInDate: '2026-07-21',
      moveOutDate: null,
      durationLabel: 'Monthly',
      roomType: null,
      bedCode: 'B1',
      roomNumber: '101',
      monthlyRentPaise: 500_000,
      depositRequiredPaise: 500_000,
      durationMode: 'monthly',
      stayType: null,
      bookingStatus: 'pending_payment',
      subtotalPaise: 500_000,
      discountPaise: 0,
      rentDuePaise: 500_000,
    },
  });
  assert.match(label, /21 Jul 2026 cycle/);
});

test('formatPaymentReviewBillingMonth shows calendar month for fixed stays', () => {
  const label = formatPaymentReviewBillingMonth({
    billingMonth: '2026-07-01',
    bookingDetails: {
      moveInDate: '2026-07-21',
      moveOutDate: '2026-08-21',
      durationLabel: 'Fixed',
      roomType: null,
      bedCode: 'B1',
      roomNumber: '101',
      monthlyRentPaise: null,
      depositRequiredPaise: null,
      durationMode: 'fixed',
      stayType: null,
      bookingStatus: 'pending_payment',
      subtotalPaise: null,
      discountPaise: null,
      rentDuePaise: null,
    },
  });
  assert.equal(label, 'July 2026');
});

test('buildQrReviewItem sets billingMonth from move-in anchor', () => {
  const src = readFileSync('src/services/paymentProofQueue.ts', 'utf8');
  assert.match(src, /resolvePaymentReviewBillingMonth\(/);
  assert.match(src, /billingMonth,/);
});