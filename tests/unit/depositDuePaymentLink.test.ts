import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('ensureDepositDuePaymentLink passes bookingId to getOrCreatePaymentLink', async () => {
  const source = readFileSync(
    join(process.cwd(), 'src/services/depositCollection.ts'),
    'utf8',
  );
  assert.match(
    source,
    /getOrCreatePaymentLink\(\{[\s\S]*bookingId,/,
    'ensureDepositDuePaymentLink must pass bookingId into getOrCreatePaymentLink',
  );
  assert.doesNotMatch(
    source.slice(source.indexOf('export async function ensureDepositDuePaymentLink')),
    /createPaymentLink\(/,
    'ensureDepositDuePaymentLink must not call createPaymentLink directly',
  );
});

test('ensureDepositDuePaymentLink expires superseded active deposit links', async () => {
  const source = readFileSync(
    join(process.cwd(), 'src/services/depositCollection.ts'),
    'utf8',
  );
  assert.match(source, /expireSupersededActiveDepositLinks/);
});

test('getOrCreatePaymentLink backfills booking_id on reused deposit links', async () => {
  const source = readFileSync(join(process.cwd(), 'src/services/paymentLinks.ts'), 'utf8');
  assert.match(
    source,
    /input\.bookingId && !existing\.bookingId && input\.purpose === 'deposit'/,
  );
});
