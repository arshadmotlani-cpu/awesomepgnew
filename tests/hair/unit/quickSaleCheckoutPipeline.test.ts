import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
function readSrc(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('package plan metadata is prefetched before checkout transaction', () => {
  const pipeline = readSrc('src/hair/domain/checkout/pipeline.ts');
  const prefetchIdx = pipeline.indexOf('listPackagePlansDetailed({ includeInactive: true }, ctx)');
  const txIdx = pipeline.indexOf('const invoiceId = await hairDb.transaction');
  assert.ok(prefetchIdx > 0 && txIdx > prefetchIdx, 'prefetch must occur before hairDb.transaction');
});

test('listPackagePlansDetailed is not called inside hairDb.transaction', () => {
  const pipeline = readSrc('src/hair/domain/checkout/pipeline.ts');
  const txStart = pipeline.indexOf('const invoiceId = await hairDb.transaction(async (tx) => {');
  const txEnd = pipeline.indexOf('});', txStart);
  assert.ok(txStart > 0 && txEnd > txStart);
  const txBlock = pipeline.slice(txStart, txEnd);
  assert.doesNotMatch(txBlock, /listPackagePlansDetailed/);
});

test('listPackagePlansDetailed accepts optional db parameter', () => {
  const src = readSrc('src/hair/services/packagePlans.ts');
  assert.match(src, /db: typeof hairDb = hairDb/);
  assert.match(src, /await db\s*\n\s*\.select\(\)/);
});

test('completeQuickSaleAction returns invoiceId even when invoice number lookup fails', () => {
  const action = readSrc('src/hair/actions/quickSale.ts');
  assert.match(action, /Invoice is committed; invoice number is best-effort/);
  assert.match(action, /invoiceId: result\.invoiceId/);
});
