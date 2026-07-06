import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCKING_RESERVATION_STATUSES,
  BLOCKING_RESERVATION_STATUS_SQL,
} from '@/src/lib/reservationBlocking';

test('blocking reservation statuses include under_review and active', () => {
  assert.deepEqual(BLOCKING_RESERVATION_STATUSES, ['under_review', 'active']);
  assert.match(BLOCKING_RESERVATION_STATUS_SQL, /under_review/);
  assert.match(BLOCKING_RESERVATION_STATUS_SQL, /active/);
});
