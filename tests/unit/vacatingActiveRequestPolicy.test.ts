import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_VACATING_STATUSES,
  vacatingStatusBlocksNewSubmit,
} from '@/src/lib/vacating/activeRequestPolicy';
import { vacatingNextStep } from '@/src/lib/residents/vacatingJourney';

test('ACTIVE_VACATING_STATUSES lists pending and approved only', () => {
  assert.deepEqual(ACTIVE_VACATING_STATUSES, ['pending', 'approved']);
});

test('vacatingStatusBlocksNewSubmit — pending request blocks resubmit', () => {
  assert.equal(vacatingStatusBlocksNewSubmit('pending'), true);
});

test('vacatingStatusBlocksNewSubmit — approved request blocks resubmit', () => {
  assert.equal(vacatingStatusBlocksNewSubmit('approved'), true);
});

test('vacatingStatusBlocksNewSubmit — rejected request allows resubmit', () => {
  assert.equal(vacatingStatusBlocksNewSubmit('rejected'), false);
});

test('vacatingStatusBlocksNewSubmit — completed request allows resubmit', () => {
  assert.equal(vacatingStatusBlocksNewSubmit('completed'), false);
});

test('vacatingStatusBlocksNewSubmit — withdrawn/cancelled rows are not stored (no block)', () => {
  assert.equal(vacatingStatusBlocksNewSubmit('cancelled'), false);
});

test('vacatingNextStep surfaces admin rejection reason for residents', () => {
  const step = vacatingNextStep({
    vacating: {
      id: 'vr-1',
      bookingId: 'bk-1',
      noticeGivenDate: '2026-06-01',
      vacatingDate: '2026-06-20',
      noticeCompliant: false,
      deductionPaise: 50000,
      depositRefundPaise: 0,
      monthlyRentPaiseSnapshot: 1200000,
      status: 'rejected',
      notes: 'Need 15 days notice',
      resolvedAt: new Date('2026-06-02'),
      createdAt: new Date('2026-06-01'),
    },
    checkoutStatus: null,
  });
  assert.equal(step.headline, 'Request rejected by management.');
  assert.match(step.detail, /Reason: Need 15 days notice/);
});
