import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  ACTIONABLE_RECONCILIATION_CHECK_IDS,
  deriveActionableReconciliation,
  isActionableReconciliationCheck,
  reconcileActionableReviewHref,
  type BillingReconciliationCheck,
} from '@/src/services/billingCycleReconciliation';

function check(id: string, pass: boolean, detail = 'detail'): BillingReconciliationCheck {
  return { id, label: id, pass, detail };
}

test('isActionableReconciliationCheck excludes revenue_integrity and june ops', () => {
  assert.equal(isActionableReconciliationCheck('no_failures'), true);
  assert.equal(isActionableReconciliationCheck('payment_reviews'), true);
  assert.equal(isActionableReconciliationCheck('revenue_integrity'), false);
  assert.equal(isActionableReconciliationCheck('june_electricity_ops'), false);
  assert.equal(ACTIONABLE_RECONCILIATION_CHECK_IDS.length, 4);
});

test('deriveActionableReconciliation counts only actionable failing checks', () => {
  const checks = [
    check('no_failures', true),
    check('no_duplicates', false, '2 duplicate group(s)'),
    check('registry_sync', false, '1 orphan'),
    check('payment_reviews', true),
    check('revenue_integrity', false, 'collected exceeds billed'),
  ];
  const result = deriveActionableReconciliation(checks, '2026-08-01');
  assert.equal(result.actionableIssueCount, 2);
  assert.equal(result.actionableStatus, 'failed');
  assert.match(result.actionableHeadline, /2 billing issues need attention/);
  assert.equal(result.actionableFailures.length, 2);
});

test('zero actionable issues when only non-actionable checks fail', () => {
  const checks = [
    check('no_failures', true),
    check('no_duplicates', true),
    check('registry_sync', true),
    check('payment_reviews', true),
    check('revenue_integrity', false),
  ];
  const result = deriveActionableReconciliation(checks, '2026-08-01');
  assert.equal(result.actionableIssueCount, 0);
  assert.equal(result.actionableStatus, 'success');
  assert.equal(result.actionableHeadline, 'Billing reconciled');
});

test('reconcileActionableReviewHref maps first failing actionable check', () => {
  const checks = [
    check('no_failures', true),
    check('no_duplicates', false),
    check('payment_reviews', false),
  ];
  assert.equal(
    reconcileActionableReviewHref(checks, '2026-08-01'),
    '/admin/electricity/duplicates',
  );
  const failuresFirst = [
    check('no_failures', false),
    check('no_duplicates', false),
  ];
  assert.equal(
    reconcileActionableReviewHref(failuresFirst, '2026-08-01'),
    '/admin/billing?tab=failures&month=2026-08',
  );
  const paymentOnly = [check('payment_reviews', false)];
  assert.equal(
    reconcileActionableReviewHref(paymentOnly, '2026-08-01'),
    '/admin/operations?filter=waiting_for_approval',
  );
});

test('billing cycle reconciliation uses month-scoped duplicate counter', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/billingCycleReconciliation.ts'),
    'utf8',
  );
  assert.match(src, /countActiveElectricityInvoiceDuplicatesForMonth/);
  assert.doesNotMatch(src, /countActiveElectricityInvoiceDuplicates\(\)/);
});

test('orphan rent query excludes paid invoices', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/billingCycleReconciliation.ts'),
    'utf8',
  );
  const orphanRent = src.match(/async function countOrphanRentInvoices[\s\S]*?^}/m)?.[0] ?? '';
  assert.match(orphanRent, /payment_in_progress/);
  assert.doesNotMatch(orphanRent, /'paid'/);
});

test('payment review proof query scopes billing month and collectible residents', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/billingCycleReconciliation.ts'),
    'utf8',
  );
  assert.match(src, /countMissingPaymentReviewProofs\(\s*session,\s*billingMonth/);
  assert.match(src, /collectibleResidentFilters\(\)/);
  const orphanRent = src.match(/async function countOrphanRentInvoices[\s\S]*?^}/m)?.[0] ?? '';
  assert.doesNotMatch(orphanRent, /'paid'/);
});
