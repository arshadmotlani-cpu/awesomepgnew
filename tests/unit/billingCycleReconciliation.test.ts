import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('billing cycle reconciliation aligns billed and collected formulas', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/billingCycleReconciliation.ts'),
    'utf8',
  );
  const metrics = readFileSync(
    join(process.cwd(), 'src/lib/billing/financialMetrics.ts'),
    'utf8',
  );

  assert.match(src, /lateFeeLockedPaise.*paidLateFeePaise/);
  assert.match(src, /electricityInvoices\.amountPaise.*lateFeeLockedPaise/);
  assert.match(src, /totalCollectedPaise <= totalBilledPaise/);
  assert.match(metrics, /eq\(rentInvoices\.isAdhoc, false\)/);
  assert.match(metrics, /sum\(ei\.paid_paise\)/);
  assert.doesNotMatch(metrics, /paid_paise \+ coalesce\(ei\.late_fee_locked_paise/);
});
