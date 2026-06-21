import assert from 'node:assert/strict';
import test from 'node:test';
import { isFinancialInvoiceCancellable } from '../../src/lib/billing/invoiceStateMachine';

test('paid express walk-in invoices use void flow not plain refund-only UI gate', () => {
  assert.equal(isFinancialInvoiceCancellable('paid'), false);
  assert.equal(isFinancialInvoiceCancellable('sent'), true);
});
