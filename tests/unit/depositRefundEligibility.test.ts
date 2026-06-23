import assert from 'node:assert/strict';
import test from 'node:test';
import { getDepositRefundEligibility } from '../../src/lib/vacating/depositRefundEligibility';

const baseVacating = {
  id: 'v1',
  bookingId: 'b1',
  noticeGivenDate: '2026-06-01',
  vacatingDate: '2026-06-10',
  noticeCompliant: true,
  deductionPaise: 0,
  depositRefundPaise: 0,
  monthlyRentPaiseSnapshot: 100_000,
  status: 'approved' as const,
  notes: null,
  resolvedAt: null,
  createdAt: new Date('2026-06-01'),
};

test('deposit refund locked before vacate date even when approved', () => {
  const result = getDepositRefundEligibility({
    vacating: baseVacating,
    today: '2026-06-02',
  });
  assert.equal(result.canRequestRefund, false);
  assert.match(result.lockReason ?? '', /11:00 AM/);
});

test('deposit refund unlocks on vacate date when approved', () => {
  const result = getDepositRefundEligibility({
    vacating: baseVacating,
    today: '2026-06-10',
  });
  assert.equal(result.canRequestRefund, true);
});

test('deposit refund locked while vacate pending', () => {
  const result = getDepositRefundEligibility({
    vacating: { ...baseVacating, status: 'pending' },
    today: '2026-06-10',
  });
  assert.equal(result.canRequestRefund, false);
});
