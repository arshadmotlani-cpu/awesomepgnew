import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  isHairPostgresConnectionError,
} from '@/src/hair/lib/checkoutDbError';

test('hair db client aborts idle-in-transaction sessions', () => {
  const src = readFileSync(join(process.cwd(), 'src/hair/db/client.ts'), 'utf8');
  assert.match(src, /idle_in_transaction_session_timeout: 15_000/);
});

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
