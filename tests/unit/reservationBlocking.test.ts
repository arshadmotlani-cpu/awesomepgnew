import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCKING_RESERVATION_STATUSES,
  BLOCKING_RESERVATION_STATUS_SQL,
  UNDER_REVIEW_RESERVATION_PAIR_SQL,
} from '@/src/lib/reservationBlocking';

test('blocking reservation statuses include under_review and active', () => {
  assert.deepEqual(BLOCKING_RESERVATION_STATUSES, ['under_review', 'active']);
  assert.match(BLOCKING_RESERVATION_STATUS_SQL, /under_review/);
  assert.match(BLOCKING_RESERVATION_STATUS_SQL, /active/);
});

test('under-review SQL uses text cast for pre-migration safety', () => {
  assert.match(UNDER_REVIEW_RESERVATION_PAIR_SQL, /status::text = 'under_review'/);
});
