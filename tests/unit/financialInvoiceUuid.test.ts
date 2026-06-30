import assert from 'node:assert/strict';
import test from 'node:test';
import { isFinancialInvoiceUuid } from '../../src/lib/billing/resolveFinancialInvoiceRef.ts';

test('isFinancialInvoiceUuid rejects vacating electricity placeholder ids', () => {
  assert.equal(isFinancialInvoiceUuid('elec-checkout-pending-2026-06-01'), false);
  assert.equal(
    isFinancialInvoiceUuid('a1b2c3d4-e5f6-4789-a012-3456789abcde'),
    true,
  );
});
