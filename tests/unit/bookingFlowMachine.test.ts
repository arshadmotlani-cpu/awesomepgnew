import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  bookingFlowReducer,
  isBookingFlowBusy,
  isStuckCreateSubmit,
  shouldRecoverStuckContinue,
} from '../../src/lib/booking/bookingFlowMachine';

test('review → auth for guest continue', () => {
  assert.equal(
    bookingFlowReducer('REVIEW', { type: 'CONTINUE_GUEST' }),
    'AUTH_REQUIRED',
  );
});

test('review → create for signed-in continue', () => {
  assert.equal(
    bookingFlowReducer('REVIEW', { type: 'CONTINUE_SIGNED_IN' }),
    'CREATE_BOOKING',
  );
});

test('create error returns to FAILED not CREATE_BOOKING', () => {
  assert.equal(
    bookingFlowReducer('CREATE_BOOKING', { type: 'CREATE_ERROR' }),
    'FAILED',
  );
});

test('busy for entire CREATE_BOOKING step (not only while isPending)', () => {
  assert.equal(isBookingFlowBusy('CREATE_BOOKING', true), true);
  assert.equal(isBookingFlowBusy('CREATE_BOOKING', false), true);
  assert.equal(isBookingFlowBusy('FAILED', true), false);
  assert.equal(isBookingFlowBusy('REVIEW', false), false);
});

test('stuck create requires pending never observed', () => {
  assert.equal(
    isStuckCreateSubmit({
      step: 'CREATE_BOOKING',
      submitGuard: true,
      actionPending: false,
      actionStatus: 'idle',
      sawActionPending: false,
    }),
    true,
  );
  // Gap after pending completed but before status updates must NOT count as stuck.
  assert.equal(
    isStuckCreateSubmit({
      step: 'CREATE_BOOKING',
      submitGuard: true,
      actionPending: false,
      actionStatus: 'idle',
      sawActionPending: true,
    }),
    false,
  );
});

test('recover stuck continue when guard held off REVIEW', () => {
  assert.equal(
    shouldRecoverStuckContinue({ step: 'CREATE_BOOKING', submitGuard: true }),
    true,
  );
  assert.equal(
    shouldRecoverStuckContinue({ step: 'REVIEW', submitGuard: true }),
    false,
  );
});

test('continue without coupon is not gated by reducer', () => {
  assert.equal(
    bookingFlowReducer('REVIEW', { type: 'CONTINUE_SIGNED_IN' }),
    'CREATE_BOOKING',
  );
  assert.equal(bookingFlowReducer('FAILED', { type: 'RESET' }), 'REVIEW');
});
