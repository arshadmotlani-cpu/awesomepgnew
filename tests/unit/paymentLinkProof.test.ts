import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('assertActivePaymentLink', () => {
  it('rejects empty link id without database', async () => {
    const { assertActivePaymentLink } = await import('../../src/lib/billing/paymentLinkAccess');
    const result = await assertActivePaymentLink('');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
    }
  });
});

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

describe('buildDepositCollectionWhatsAppUrl', () => {
  it('builds reminder without payment link', async () => {
    const { buildDepositCollectionWhatsAppUrl } = await import(
      '../../src/lib/billing/depositCollectionWhatsApp'
    );
    const url = buildDepositCollectionWhatsAppUrl({
      residentName: 'Dhruv',
      phone: '+919876543210',
      pgName: 'Test PG',
      roomNumber: '101',
      bedCode: 'A1',
      depositDuePaise: 16500,
    });
    assert.ok(url?.startsWith('https://wa.me/'));
    assert.ok(!url?.includes('/pay/'));
  });
});
