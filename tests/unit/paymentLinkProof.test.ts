import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('submitDepositLinkPaymentProof identity', () => {
  it('rejects empty customerId without touching the link', async () => {
    const { submitDepositLinkPaymentProof } = await import(
      '../../src/services/residentCharges'
    );
    const result = await submitDepositLinkPaymentProof(
      '00000000-0000-0000-0000-000000000001',
      '',
      'https://example.com/proof.png',
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /sign in/i);
    }
  });
});

describe('legacy deposit ledger writers removed from deposits.ts', () => {
  it('does not export recordDepositRefunded or recordDepositDeducted', async () => {
    const deposits = await import('../../src/services/deposits');
    assert.equal('recordDepositRefunded' in deposits, false);
    assert.equal('recordDepositDeducted' in deposits, false);
  });
});
