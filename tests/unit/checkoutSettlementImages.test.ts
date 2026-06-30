import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adminCheckoutSettlementImageUrl,
  checkoutSettlementStoredUrlForKind,
} from '../../src/lib/checkout/checkoutSettlementImages';

describe('checkoutSettlementImages', () => {
  it('builds admin proxy URLs by settlement id and kind', () => {
    assert.equal(
      adminCheckoutSettlementImageUrl('settle-1', 'meter'),
      '/api/admin/checkout-settlement/settle-1/image/meter',
    );
    assert.equal(
      adminCheckoutSettlementImageUrl('settle-1', 'refund_qr'),
      '/api/admin/checkout-settlement/settle-1/image/refund_qr',
    );
  });

  it('reads stored URLs from settlement fields', () => {
    assert.equal(
      checkoutSettlementStoredUrlForKind(
        {
          electricityMeterPhotoUrl: ' https://x.private.blob.vercel-storage.com/a.jpg ',
          payoutQrUrl: null,
        },
        'meter',
      ),
      'https://x.private.blob.vercel-storage.com/a.jpg',
    );
    assert.equal(
      checkoutSettlementStoredUrlForKind(
        { payoutQrUrl: 'https://x.private.blob.vercel-storage.com/qr.jpg' },
        'refund_qr',
      ),
      'https://x.private.blob.vercel-storage.com/qr.jpg',
    );
  });
});
