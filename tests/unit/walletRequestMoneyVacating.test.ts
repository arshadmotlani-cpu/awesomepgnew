import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDepositRefundUnlockState } from '@/src/lib/billing/depositRefundUnlock';

const requestMoneySheet = readFileSync(
  join(process.cwd(), 'src/components/customer/account/RequestMoneySheet.tsx'),
  'utf8',
);
const profileWalletPanel = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/ProfileWalletPanel.tsx'),
  'utf8',
);

test('Request money entry is not gated on vacating or deposit refund eligibility', () => {
  assert.doesNotMatch(requestMoneySheet, /hasOpenVacating/);
  assert.doesNotMatch(requestMoneySheet, /disabled=\{!canRequestRefund/);
  assert.match(requestMoneySheet, /onClick=\{\(\) => setOpen\(true\)\}/);
});

test('deposit refund lock is scoped to deposit_refund branch only', () => {
  assert.doesNotMatch(profileWalletPanel, /Deposit refund not available yet/);
  assert.match(requestMoneySheet, /Security deposit refund not available yet/);
  assert.match(requestMoneySheet, /kind === 'deposit_refund'/);
  assert.match(requestMoneySheet, /ReferralWithdrawalForm/);
});

test('approved future move-out still locks deposit refund until move-out date', () => {
  const unlock = computeDepositRefundUnlockState({
    booking: {
      status: 'confirmed',
      durationMode: 'monthly',
      expectedCheckoutDate: null,
      createdAt: new Date('2026-01-01'),
    },
    vacating: {
      id: 'v1',
      bookingId: 'b1',
      noticeGivenDate: '2026-09-01',
      vacatingDate: '2026-09-10',
      noticeCompliant: true,
      deductionPaise: 0,
      depositRefundPaise: 0,
      monthlyRentPaiseSnapshot: 30_000,
      status: 'approved',
      notes: null,
      resolvedAt: null,
      createdAt: new Date('2026-09-01'),
    },
    settlement: null,
    residentRequest: null,
    today: '2026-09-08',
  });
  assert.equal(unlock.canRequestRefund, false);
  assert.match(unlock.lockReason ?? '', /approved move-out date/);
});

test('pending vacating does not change deposit unlock SSOT beyond existing deposit rules', () => {
  const unlock = computeDepositRefundUnlockState({
    booking: {
      status: 'confirmed',
      durationMode: 'monthly',
      expectedCheckoutDate: null,
      createdAt: new Date('2026-01-01'),
    },
    vacating: {
      id: 'v1',
      bookingId: 'b1',
      noticeGivenDate: '2026-09-08',
      vacatingDate: '2026-09-10',
      noticeCompliant: true,
      deductionPaise: 0,
      depositRefundPaise: 0,
      monthlyRentPaiseSnapshot: 30_000,
      status: 'pending',
      notes: null,
      resolvedAt: null,
      createdAt: new Date('2026-09-08'),
    },
    settlement: null,
    residentRequest: null,
    today: '2026-09-08',
  });
  assert.equal(unlock.canRequestRefund, false);
  assert.match(unlock.lockReason ?? '', /admin approves your move-out request/);
});

test('no vacating keeps monthly deposit refund locked until move-out request exists', () => {
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
    today: '2026-09-08',
  });
  assert.equal(unlock.canRequestRefund, false);
  assert.match(unlock.lockReason ?? '', /Submit a move-out request first/);
});
