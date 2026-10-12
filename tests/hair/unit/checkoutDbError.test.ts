import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  checkoutErrorKind,
  isHairPostgresConnectionError,
  isIdleInTransactionSessionTimeout,
} from '@/src/hair/lib/checkoutDbError';
import { invoiceLinesNeedLegacyCommissionFallback } from '@/src/hair/services/invoices';

test('checkout transaction arms idle timeout with SET LOCAL', () => {
  const src = readFileSync(join(process.cwd(), 'src/hair/domain/checkout/pipeline.ts'), 'utf8');
  assert.match(src, /set_config\('idle_in_transaction_session_timeout', '15000', true\)/);
  const client = readFileSync(join(process.cwd(), 'src/hair/db/client.ts'), 'utf8');
  assert.doesNotMatch(client, /idle_in_transaction_session_timeout/);
});

test('product-only sales skip the legacy attribution lookup', () => {
  assert.equal(
    invoiceLinesNeedLegacyCommissionFallback([
      { kind: 'product', serviceId: null },
    ]),
    false,
  );
  assert.equal(
    invoiceLinesNeedLegacyCommissionFallback([
      { kind: 'service', serviceId: 'svc-1' },
    ]),
    true,
  );
});

test('quick sale inventory keeps the checkout tenant context', () => {
  const src = readFileSync(join(process.cwd(), 'src/hair/services/invoices.ts'), 'utf8');
  assert.match(src, /movementType: 'sale'[\s\S]*?\},\s*ctx,/);
});

test('connection closed is classified without SQL text', () => {
  assert.equal(
    checkoutErrorKind(new Error('write CONNECTION_CLOSED ep-example-pooler.neon.tech:5432')),
    'connection_closed',
  );
  assert.equal(checkoutErrorKind({ code: '25P03' }), 'idle_timeout');
});

test('detects idle-in-transaction session timeout', () => {
  assert.equal(isIdleInTransactionSessionTimeout({ code: '25P03' }), true);
  assert.equal(
    isIdleInTransactionSessionTimeout(
      new Error('terminating connection due to idle-in-transaction timeout'),
    ),
    true,
  );
  assert.equal(isIdleInTransactionSessionTimeout(new Error('validation failed')), false);
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
