import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { isStaleCheckoutOperation } from '@/src/hair/lib/checkoutOperationLease';

const root = process.cwd();
function readSrc(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('invoice commit finalizes checkout operation inside the same transaction', () => {
  const pipeline = readSrc('src/hair/domain/checkout/pipeline.ts');
  const txStart = pipeline.indexOf('const invoiceId = await hairDb.transaction');
  const txEnd = pipeline.indexOf('return inv.id;', txStart);
  const block = pipeline.slice(txStart, txEnd);
  assert.match(block, /update\(fyhCheckoutOperations\)/);
  assert.match(block, /status: 'committed'/);
  assert.match(block, /checkoutOperationCorrelationId/);
});

test('executeBasketCheckout reconciles after connection errors before failing', () => {
  const op = readSrc('src/hair/domain/checkout/operation.ts');
  assert.match(op, /invalidateHairDbOnConnectionError/);
  assert.match(op, /reconcileCheckoutAttempt/);
  assert.match(op, /connectionLossOutcome/);
});

test('claim lease uses atomic reclaim for stale processing rows', () => {
  const claim = readSrc('src/hair/domain/checkout/claimLease.ts');
  assert.match(claim, /\.update\(fyhCheckoutOperations\)/);
  assert.match(claim, /lt\(fyhCheckoutOperations\.createdAt, staleBefore\)/);
});

test('stale lease is older than client checkout timeout', () => {
  const client = readSrc('src/hair/lib/quickSaleCheckoutClient.ts');
  const lease = readSrc('src/hair/lib/checkoutOperationLease.ts');
  const stale = Number(lease.match(/STALE_MS = (\d+)/)?.[1]);
  const clientMs = Number(client.match(/CLIENT_TIMEOUT_MS = (\d+)/)?.[1]);
  assert.ok(stale > clientMs);
});

test('isStaleCheckoutOperation respects age threshold', () => {
  const now = Date.now();
  assert.equal(isStaleCheckoutOperation(new Date(now - 120_000), now), true);
  assert.equal(isStaleCheckoutOperation(new Date(now - 10_000), now), false);
});
