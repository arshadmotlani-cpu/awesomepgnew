import assert from 'node:assert/strict';
import test from 'node:test';
import { focusStepsForPath } from '../../src/lib/cockroach/guideFocusSteps';

test('focusStepsForPath orders PG detail steps', () => {
  assert.deepEqual(focusStepsForPath('/pgs/shantinagar-awesome-pg'), [
    'stay-dates',
    'room-pick',
  ]);
});

test('focusStepsForPath orders room detail steps', () => {
  assert.deepEqual(focusStepsForPath('/pgs/shantinagar-awesome-pg/rooms/abc'), [
    'stay-dates',
    'bed-pick',
  ]);
});

test('focusStepsForPath covers booking and resident flows', () => {
  assert.deepEqual(focusStepsForPath('/booking/new'), ['confirm-booking']);
  assert.deepEqual(focusStepsForPath('/account/resident'), ['vacating', 'pay-rent']);
});
