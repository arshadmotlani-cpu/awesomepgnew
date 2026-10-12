import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isHairPostgresConnectionError,
} from '@/src/hair/lib/checkoutDbError';

test('detects Neon CONNECTION_CLOSED errors', () => {
  assert.equal(
    isHairPostgresConnectionError(
      new Error('write CONNECTION_CLOSED ep-billowing-bar-pooler.neon.tech:5432'),
    ),
    true,
  );
  assert.equal(isHairPostgresConnectionError({ code: 'CONNECT_TIMEOUT' }), true);
  assert.equal(isHairPostgresConnectionError(new Error('validation failed')), false);
});
