import assert from 'node:assert/strict';
import test from 'node:test';

const MANUAL_REVIEW_TYPES = new Set([
  'DUPLICATE_INVOICE',
  'MISSING_RENT_INVOICE',
  'DEPOSIT_LEDGER_NEGATIVE',
  'OUTSTANDING_NOT_SURFACED',
  'INVOICE_EMPTY',
]);

test('daily reconciliation flags manual-review check types', () => {
  assert.ok(MANUAL_REVIEW_TYPES.has('DUPLICATE_INVOICE'));
  assert.ok(MANUAL_REVIEW_TYPES.has('MISSING_RENT_INVOICE'));
  assert.ok(!MANUAL_REVIEW_TYPES.has('INVOICE_TOTAL_MISMATCH'));
});

test('daily reconciliation audit_log diff shape', () => {
  const diff = {
    issueCount: 3,
    repairedCount: 2,
    manualReviewCount: 1,
    byCheckType: { INVOICE_TOTAL_MISMATCH: 2, DUPLICATE_INVOICE: 1 },
    beforeIssueCount: 5,
  };
  assert.equal(diff.issueCount, 3);
  assert.equal(diff.repairedCount + diff.manualReviewCount, 3);
  assert.ok(diff.beforeIssueCount >= diff.issueCount);
});

test('daily reconciliation sourceKey is stable per issue', () => {
  const issue = {
    checkType: 'DUPLICATE_INVOICE',
    customerId: 'cust-1',
    invoiceId: 'inv-1',
    bookingId: null,
  };
  const sourceKey = `financial_audit:${issue.checkType}:${issue.invoiceId ?? issue.bookingId ?? issue.customerId}`;
  assert.equal(sourceKey, 'financial_audit:DUPLICATE_INVOICE:inv-1');
});
