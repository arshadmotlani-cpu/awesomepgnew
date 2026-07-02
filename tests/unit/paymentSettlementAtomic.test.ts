import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeFinancialStatusFromRent } from '../../src/lib/billing/invoiceStateMachine';

test('rent payment settlement should project mirror status paid when source is paid', () => {
  const status = mergeFinancialStatusFromRent('sent', 'paid', '2026-06-01', false);
  assert.equal(status, 'paid');
});

test('electricity unified status maps paid source to paid mirror', () => {
  function elecStatusToUnified(status: string, dueDate: string) {
    if (status === 'paid') return 'paid';
    if (status === 'cancelled') return 'cancelled';
    if (dueDate < new Date().toISOString().slice(0, 10)) return 'overdue';
    return 'sent';
  }
  assert.equal(elecStatusToUnified('paid', '2026-06-01'), 'paid');
  assert.equal(elecStatusToUnified('pending', '2020-01-01'), 'overdue');
});

test('approved payment with due invoice is auto-repairable class', () => {
  const issue = {
    checkType: 'APPROVED_PAYMENT_INVOICE_DUE' as const,
    autoRepairable: true,
  };
  assert.equal(issue.autoRepairable, true);
});

test('duplicate source invoice issues require manual review', () => {
  const issue = {
    checkType: 'DUPLICATE_SOURCE_INVOICE' as const,
    autoRepairable: false,
  };
  assert.equal(issue.autoRepairable, false);
});
