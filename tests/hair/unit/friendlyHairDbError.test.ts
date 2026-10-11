import assert from 'node:assert/strict';
import test from 'node:test';
import { friendlyHairDbError } from '@/src/hair/lib/friendlyDbError';

test('maps missing checkout_attempt_key (42703) without leaking SQL', () => {
  const err = Object.assign(new Error('Failed query: insert into fyh_invoices'), {
    cause: {
      code: '42703',
      message: 'column fyh_invoices.checkout_attempt_key does not exist',
    },
  });
  const msg = friendlyHairDbError(err, 'corr-1');
  assert.match(msg, /0054/);
  assert.match(msg, /corr-1/);
  assert.doesNotMatch(msg, /Failed query/);
  assert.doesNotMatch(msg, /insert into/);
});

test('maps Failed query wrapper to safe checkout message', () => {
  const msg = friendlyHairDbError(new Error('Failed query: insert into "fyh_invoices" (...)'), 'abc');
  assert.match(msg, /Could not save this sale/);
  assert.doesNotMatch(msg, /insert into/);
});
