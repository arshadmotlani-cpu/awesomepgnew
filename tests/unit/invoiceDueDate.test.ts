import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampDueDateOnOrAfterIssueDate,
  resolveRentInvoiceDueDate,
} from '@/src/lib/billing/invoiceDueDate';

test('clampDueDateOnOrAfterIssueDate keeps due when on or after issue', () => {
  assert.equal(clampDueDateOnOrAfterIssueDate('2026-06-24', '2026-06-23'), '2026-06-24');
  assert.equal(clampDueDateOnOrAfterIssueDate('2026-06-24', '2026-06-24'), '2026-06-24');
});

test('clampDueDateOnOrAfterIssueDate bumps due to issue when before', () => {
  assert.equal(clampDueDateOnOrAfterIssueDate('2026-06-20', '2026-06-24'), '2026-06-24');
});

test('resolveRentInvoiceDueDate clamps stay start before issue', () => {
  assert.equal(
    resolveRentInvoiceDueDate({
      stayStart: '2026-06-20',
      issueDate: '2026-06-24',
    }),
    '2026-06-24',
  );
});
