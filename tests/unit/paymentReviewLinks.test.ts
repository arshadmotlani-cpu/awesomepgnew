import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  paymentReviewWorkspaceHref,
  qrPaymentReviewKey,
} from '@/src/lib/operations/paymentReviewLinks';

describe('paymentReviewLinks', () => {
  test('paymentReviewWorkspaceHref encodes review key', () => {
    assert.equal(
      paymentReviewWorkspaceHref('qr-abc-123'),
      '/admin/payment-review/qr-abc-123',
    );
    assert.equal(
      paymentReviewWorkspaceHref('rent/inv#1'),
      '/admin/payment-review/rent%2Finv%231',
    );
  });

  test('qrPaymentReviewKey prefixes record id', () => {
    assert.equal(qrPaymentReviewKey('pay-1'), 'qr-pay-1');
  });
});
