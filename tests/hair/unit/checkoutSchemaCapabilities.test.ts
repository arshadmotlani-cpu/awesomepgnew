import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('checkout omits checkout_attempt_key from invoice insert when column not ready', () => {
  const pipeline = readFileSync(join(root, 'src/hair/domain/checkout/pipeline.ts'), 'utf8');
  assert.match(pipeline, /hairCheckoutAttemptKeyColumnReady/);
  assert.match(pipeline, /attemptKeyColumnReady && attemptKey \? \{ checkoutAttemptKey: attemptKey \}/);
});

test('checkout operation skips journal when fyh_checkout_operations is missing', () => {
  const op = readFileSync(join(root, 'src/hair/domain/checkout/operation.ts'), 'utf8');
  assert.match(op, /hairCheckoutOperationsTableReady/);
  assert.match(op, /if \(operationsTableReady\)/);
});
