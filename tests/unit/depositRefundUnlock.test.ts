import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeDepositRefundUnlockState,
  estimateNoticeDeductionPaise,
} from '../../src/lib/billing/depositRefundUnlock';

test('fixed stay refund always available while stay is active', () => {
  const result = computeDepositRefundUnlockState({
    booking: {
      status: 'confirmed',
      durationMode: 'fixed_stay',
      expectedCheckoutDate: '2026-06-10',
      createdAt: new Date('2026-05-20'),
    },
    vacating: null,
    settlement: null,
    residentRequest: null,
    monthlyRentPaise: 30_000,
    now: new Date('2026-06-10T05:00:00.000Z'),
  });
  assert.equal(result.state, 'unlocked');
  assert.equal(result.canRequestRefund, true);
  assert.equal(result.lockReason, null);
});

test('fixed stay unlocked after auto-expiry completes booking', () => {
  const result = computeDepositRefundUnlockState({
    booking: {
      status: 'completed',
      durationMode: 'fixed_stay',
      expectedCheckoutDate: '2026-06-10',
      createdAt: new Date('2026-05-20'),
    },
    vacating: {
      id: 'v1',
      bookingId: 'b1',
      noticeGivenDate: '2026-05-20',
      vacatingDate: '2026-06-10',
      noticeCompliant: true,
      deductionPaise: 0,
      depositRefundPaise: 0,
      monthlyRentPaiseSnapshot: 30_000,
      status: 'approved',
      notes: null,
      resolvedAt: null,
      createdAt: new Date('2026-05-20'),
    },
    settlement: { status: 'awaiting_resident_details' },
    residentRequest: null,
    monthlyRentPaise: 30_000,
    now: new Date('2026-06-10T06:00:00.000Z'),
  });
  assert.equal(result.state, 'unlocked');
  assert.equal(result.canRequestRefund, true);
});

test('notice penalty zero when notice >= 14 days at booking', () => {
  const deduction = estimateNoticeDeductionPaise({
    monthlyRentPaise: 30_000,
    noticeGivenDate: '2026-05-20',
    vacatingDate: '2026-06-10',
  });
  assert.equal(deduction, 0);
});

test('notice penalty uses 5-day vacating penalty for short notice monthly path', () => {
  const deduction = estimateNoticeDeductionPaise({
    monthlyRentPaise: 30_000,
    noticeGivenDate: '2026-06-05',
    vacatingDate: '2026-06-10',
  });
  assert.equal(deduction, 5000);
});

test('monthly vacating locked until vacate date after approval', () => {
  const result = computeDepositRefundUnlockState({
    booking: {
      status: 'confirmed',
      durationMode: 'monthly',
      expectedCheckoutDate: null,
      createdAt: new Date('2026-01-01'),
    },
    vacating: {
      id: 'v1',
      bookingId: 'b1',
      noticeGivenDate: '2026-06-01',
      vacatingDate: '2026-06-15',
      noticeCompliant: true,
      deductionPaise: 0,
      depositRefundPaise: 0,
      monthlyRentPaiseSnapshot: 30_000,
      status: 'approved',
      notes: null,
      resolvedAt: null,
      createdAt: new Date('2026-06-01'),
    },
    settlement: { status: 'awaiting_resident_details' },
    residentRequest: null,
    today: '2026-06-10',
  });
  assert.equal(result.state, 'locked');
  assert.match(result.lockReason ?? '', /approved move-out date/);
});
