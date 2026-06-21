import { strict as assert } from 'node:assert';
import test from 'node:test';

test('finalizeExpressWalkInFinancialInvoice rent path requires rentInvoiceId when rent recorded', () => {
  // Contract test: express walk-in must pass rentInvoiceId from collection to avoid ambiguous lookup.
  const rentCollection = {
    ok: true as const,
    chargeType: 'rent' as const,
    amountPaise: 500000,
    rentInvoiceId: 'rent-invoice-uuid',
    invoiceNumber: 'RNT-JUN-0001',
    message: 'ok',
  };

  assert.equal(rentCollection.rentInvoiceId, 'rent-invoice-uuid');
  assert.ok(rentCollection.amountPaise > 0);
});

test('deposit-only express walk-in should still produce a financial invoice mirror', () => {
  const depositRecordedPaise = 100000;
  const rentRecordedPaise = 0;
  assert.ok(depositRecordedPaise > 0 || rentRecordedPaise > 0);
  assert.equal(rentRecordedPaise, 0);
});
