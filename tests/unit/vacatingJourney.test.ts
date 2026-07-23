import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canRequestMoveOutRefund,
  vacatingStageIndex,
  VACATING_JOURNEY_STAGES,
} from '@/src/lib/residents/vacatingJourney';

test('pending vacating stays at admin approval even when orphan settlement exists', () => {
  const index = vacatingStageIndex({
    vacatingStatus: 'pending',
    checkoutStatus: 'awaiting_resident_details',
    vacatingDate: '2026-08-20',
  });
  assert.equal(index, 1);
  assert.equal(VACATING_JOURNEY_STAGES[index]?.label, 'Waiting for Admin Approval');
});

test('approved before vacate date waits for refund request', () => {
  const index = vacatingStageIndex({
    vacatingStatus: 'approved',
    checkoutStatus: null,
    vacatingDate: '2026-08-20',
    today: '2026-08-01',
  });
  assert.equal(index, 2);
});

test('awaiting admin review is settlement under review', () => {
  const index = vacatingStageIndex({
    vacatingStatus: 'approved',
    checkoutStatus: 'awaiting_admin_review',
    vacatingDate: '2026-07-01',
    today: '2026-07-21',
  });
  assert.equal(index, 3);
  assert.equal(VACATING_JOURNEY_STAGES[index]?.label, 'Settlement Under Review');
});

test('zero refund skips refund approved stage', () => {
  const index = vacatingStageIndex({
    vacatingStatus: 'completed',
    checkoutStatus: 'refund_pending',
    finalRefundPaise: 0,
  });
  assert.equal(index, 5);
});

test('refund request blocked before vacate date', () => {
  const gate = canRequestMoveOutRefund({
    vacatingStatus: 'approved',
    vacatingDate: '2026-08-20',
    checkoutStatus: null,
    today: '2026-08-01',
  });
  assert.equal(gate.allowed, false);
  assert.match(gate.reason ?? '', /unlocks on/);
});

test('refund request allowed on vacate date', () => {
  const gate = canRequestMoveOutRefund({
    vacatingStatus: 'approved',
    vacatingDate: '2026-08-20',
    checkoutStatus: null,
    today: '2026-08-20',
  });
  assert.equal(gate.allowed, true);
});
