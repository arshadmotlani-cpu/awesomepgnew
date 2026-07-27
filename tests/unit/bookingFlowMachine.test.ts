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

test('busy only during CREATE_BOOKING while action pending', () => {
  assert.equal(isBookingFlowBusy('CREATE_BOOKING', true), true);
  assert.equal(isBookingFlowBusy('CREATE_BOOKING', false), false);
  assert.equal(isBookingFlowBusy('FAILED', true), false);
});

test('stuck create: guard true, CREATE_BOOKING, never pending, idle action', () => {
  assert.equal(
    isStuckCreateSubmit({
      step: 'CREATE_BOOKING',
      submitGuard: true,
      actionPending: false,
      actionStatus: 'idle',
    }),
    true,
  );
  assert.equal(
    isStuckCreateSubmit({
      step: 'CREATE_BOOKING',
      submitGuard: true,
      actionPending: true,
      actionStatus: 'idle',
    }),
    false,
  );
  assert.equal(
    isStuckCreateSubmit({
      step: 'CREATE_BOOKING',
      submitGuard: true,
      actionPending: false,
      actionStatus: 'error',
    }),
    false,
  );
  assert.equal(
    isStuckCreateSubmit({
      step: 'REVIEW',
      submitGuard: true,
      actionPending: false,
      actionStatus: 'idle',
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
    shouldRecoverStuckContinue({ step: 'AUTH_REQUIRED', submitGuard: true }),
    true,
  );
  assert.equal(
    shouldRecoverStuckContinue({ step: 'REVIEW', submitGuard: true }),
    false,
  );
  assert.equal(
    shouldRecoverStuckContinue({ step: 'FAILED', submitGuard: true }),
    false,
  );
  assert.equal(
    shouldRecoverStuckContinue({ step: 'CREATE_BOOKING', submitGuard: false }),
    false,
  );
});

test('continue without coupon is not gated by reducer', () => {
  // Signed-in continue always enters create from REVIEW regardless of coupon.
  assert.equal(
    bookingFlowReducer('REVIEW', { type: 'CONTINUE_SIGNED_IN' }),
    'CREATE_BOOKING',
  );
  assert.equal(
    bookingFlowReducer('CREATE_BOOKING', { type: 'CREATE_TIMEOUT' }),
    'FAILED',
  );
  assert.equal(bookingFlowReducer('FAILED', { type: 'RESET' }), 'REVIEW');
});
