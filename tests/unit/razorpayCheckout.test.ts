import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  razorpayCheckoutSign,
  razorpayCheckoutVerify,
} from '../../src/lib/payments/razorpayCheckout';

describe('razorpayCheckout signature', () => {
  const secret = 'test_key_secret';
  const orderId = 'order_ABC123';
  const paymentId = 'pay_XYZ789';

  it('signs order_id|payment_id deterministically', () => {
    const sig = razorpayCheckoutSign(orderId, paymentId, secret);
    assert.equal(sig, razorpayCheckoutSign(orderId, paymentId, secret));
    assert.match(sig, /^[a-f0-9]{64}$/);
  });

  it('verify accepts a valid checkout signature', () => {
    const sig = razorpayCheckoutSign(orderId, paymentId, secret);
    assert.equal(
      razorpayCheckoutVerify({ orderId, paymentId, signature: sig, secret }),
      true,
    );
  });

  it('verify rejects tampered payment id', () => {
    const sig = razorpayCheckoutSign(orderId, paymentId, secret);
    assert.equal(
      razorpayCheckoutVerify({
        orderId,
        paymentId: paymentId + 'x',
        signature: sig,
        secret,
      }),
      false,
    );
  });
});
