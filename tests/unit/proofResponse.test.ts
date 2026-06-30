import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminPaymentProofViewUrl,
  customerPaymentProofViewUrl,
  isDataProofUrl,
  proofUrlToImageResponse,
} from '../../src/lib/payments/proofResponse';

describe('proofResponse', () => {
  it('builds admin view URLs by kind and id', () => {
    assert.equal(
      adminPaymentProofViewUrl('playstation', 'abc-123'),
      '/api/admin/payment-proof/playstation/abc-123',
    );
  });

  it('detects data URLs', () => {
    assert.equal(isDataProofUrl('data:image/jpeg;base64,abc'), true);
    assert.equal(isDataProofUrl('https://cdn.example.com/proof.jpg'), false);
  });

  it('streams base64 data URLs as image responses', async () => {
    const payload = Buffer.from('fake-jpeg').toString('base64');
    const url = `data:image/jpeg;base64,${payload}`;
    const res = await proofUrlToImageResponse(url);

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'image/jpeg');
    const body = Buffer.from(await res.arrayBuffer());
    assert.equal(body.toString(), 'fake-jpeg');
  });

  it('builds customer view URLs including deposit links', () => {
    assert.equal(
      customerPaymentProofViewUrl('deposit_link', 'link-1'),
      '/api/payment-proof/deposit-link/link-1',
    );
  });

  it('redirects https URLs', async () => {
    const res = await proofUrlToImageResponse('https://cdn.example.com/proof.jpg');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('Location'), 'https://cdn.example.com/proof.jpg');
  });
});
