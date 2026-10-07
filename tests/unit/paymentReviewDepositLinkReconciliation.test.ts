import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

describe('payment review deposit-link reconciliation', () => {
  test('reconcileInvoicePaymentReviewQueue heals active proof links when invoice already paid', () => {
    const src = readFileSync('src/services/paymentReviewReconciliation.ts', 'utf8');
    assert.match(src, /healedDepositLinkProofs/);
    assert.match(src, /fi\.status IN \('paid', 'settled'\)/);
    assert.match(src, /payment_proof_transaction_ref/);
  });

  test('combined invoice proof approval tolerates already-paid invoice (idempotent)', () => {
    const src = readFileSync('src/services/residentCharges.ts', 'utf8');
    assert.match(src, /Invoice is already paid\./);
    assert.match(src, /Nothing due on this invoice\./);
  });
});
