import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { todayString } from '@/src/lib/dates';
import { buildCollectionsQueue } from '@/src/lib/billing/collectionsQueue';

test('resolveBillingMonth: undefined falls back to current month', () => {
  const month = resolveBillingMonth(undefined);
  assert.match(month, /^\d{4}-\d{2}-01$/);
  assert.equal(month, resolveBillingMonth(todayString()));
});

test('resolveBillingMonth: empty string does not reach parseDate with ""', () => {
  const month = resolveBillingMonth('');
  assert.match(month, /^\d{4}-\d{2}-01$/);
  assert.equal(month, resolveBillingMonth(undefined));
});

test('resolveBillingMonth: valid YYYY-MM-DD preserved to month start', () => {
  assert.equal(resolveBillingMonth('2026-08-17'), '2026-08-01');
});

test('resolveBillingMonth: valid YYYY-MM preserved', () => {
  assert.equal(resolveBillingMonth('2026-08'), '2026-08-01');
});

test('buildCollectionsQueue: empty datasets sort without date errors', () => {
  const queue = buildCollectionsQueue({ rentRows: [], electricityRows: [] });
  assert.deepEqual(queue, []);
});

test('overview page uses resolveBillingMonth via loadOverviewContext', () => {
  const overviewData = readFileSync(join(process.cwd(), 'src/services/overviewData.ts'), 'utf8');
  assert.match(overviewData, /resolveBillingMonth/);
});

test('billing reconciliation uses resolveBillingMonth SSOT', () => {
  const recon = readFileSync(
    join(process.cwd(), 'src/services/billingCycleReconciliation.ts'),
    'utf8',
  );
  assert.match(recon, /resolveBillingMonth/);
});

test('collectionsQueue sort does not call parseDate on empty dueDate', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/billing/collectionsQueue.ts'), 'utf8');
  assert.match(src, /dueDateSortMillis/);
  assert.doesNotMatch(src, /parseDate\(aDue\)/);
});
