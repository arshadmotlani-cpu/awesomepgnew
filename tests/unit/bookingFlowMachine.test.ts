import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  bookingFlowReducer,
  isBookingFlowBusy,
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
