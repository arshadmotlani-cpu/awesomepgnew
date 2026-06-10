import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockProvider,
  razorpaySign,
  razorpayVerify,
  razorpayProvider,
} from '../../src/services/payments';

describe('razorpay signature helpers', () => {
  const secret = 'whsec_test_secret';
  const body = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_x","amount":100,"order_id":"order_x","currency":"INR"}}}}';

  it('razorpaySign is deterministic', () => {
    assert.equal(razorpaySign(body, secret), razorpaySign(body, secret));
  });

  it('razorpayVerify accepts a valid signature', () => {
    const sig = razorpaySign(body, secret);
    assert.equal(razorpayVerify(body, sig, secret), true);
  });

  it('razorpayVerify rejects a tampered body', () => {
    const sig = razorpaySign(body, secret);
    assert.equal(razorpayVerify(body + ' ', sig, secret), false);
  });

  it('razorpayVerify rejects a wrong secret', () => {
    const sig = razorpaySign(body, secret);
    assert.equal(razorpayVerify(body, sig, secret + 'x'), false);
  });

  it('razorpayVerify rejects a wrong-length signature without throwing', () => {
    assert.equal(razorpayVerify(body, 'short', secret), false);
  });
});

describe('razorpayProvider.verifyWebhook', () => {
  const secret = 'whsec_test_secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = secret;

  it('parses payment.captured into payment_succeeded', () => {
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_LX99',
            order_id: 'order_LX98',
            amount: 1_50_000,
            currency: 'INR',
            notes: { booking_code: 'APG-2026-0001' },
          },
        },
      },
    });
    const sig = razorpaySign(body, secret);
    const result = razorpayProvider.verifyWebhook({ rawBody: body, signature: sig });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.event.kind, 'payment_succeeded');
      if (result.event.kind === 'payment_succeeded') {
        assert.equal(result.event.providerPaymentId, 'pay_LX99');
        assert.equal(result.event.amountPaise, 1_50_000);
        assert.equal(result.event.receipt, 'APG-2026-0001');
      }
    }
  });

  it('parses payment.failed into payment_failed and surfaces booking_code from notes', () => {
    const body = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_FAIL',
            order_id: 'order_F',
            error_description: 'Insufficient funds',
            notes: { booking_code: 'APG-2026-9999' },
          },
        },
      },
    });
    const sig = razorpaySign(body, secret);
    const result = razorpayProvider.verifyWebhook({ rawBody: body, signature: sig });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.event.kind, 'payment_failed');
      if (result.event.kind === 'payment_failed') {
        assert.equal(result.event.providerPaymentId, 'pay_FAIL');
        assert.equal(result.event.providerOrderId, 'order_F');
        assert.equal(result.event.receipt, 'APG-2026-9999');
        assert.equal(result.event.reason, 'Insufficient funds');
      }
    }
  });

  it('payment.failed without notes still parses with receipt=null (handler will 200-ack)', () => {
    const body = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: { id: 'pay_FAIL2', order_id: 'order_F2' },
        },
      },
    });
    const sig = razorpaySign(body, secret);
    const r = razorpayProvider.verifyWebhook({ rawBody: body, signature: sig });
    assert.equal(r.ok, true);
    if (r.ok && r.event.kind === 'payment_failed') {
      assert.equal(r.event.receipt, null);
      assert.equal(r.event.reason, 'payment failed');
    }
  });

  it('rejects unsigned webhooks', () => {
    const r = razorpayProvider.verifyWebhook({ rawBody: '{}', signature: null });
    assert.equal(r.ok, false);
  });

  it('rejects bodies with bad signatures', () => {
    const r = razorpayProvider.verifyWebhook({
      rawBody: '{"event":"payment.captured"}',
      signature: 'deadbeef',
    });
    assert.equal(r.ok, false);
  });

  it('ignores payment.authorized (only captured settles funds)', () => {
    const body = JSON.stringify({
      event: 'payment.authorized',
      payload: {
        payment: {
          entity: {
            id: 'pay_AUTH',
            order_id: 'order_AUTH',
            amount: 50_00,
            currency: 'INR',
            notes: { booking_code: 'APG-2026-0001' },
          },
        },
      },
    });
    const sig = razorpaySign(body, secret);
    const r = razorpayProvider.verifyWebhook({ rawBody: body, signature: sig });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.reason, /unhandled event/i);
    }
  });
});

describe('mockProvider', () => {
  it('createOrder mints a mock order id with the booking code embedded', async () => {
    const order = await mockProvider.createOrder({
      bookingId: 'b1',
      bookingCode: 'APG-2026-0042',
      amountPaise: 50_00,
    });
    assert.equal(order.provider, 'mock');
    assert.match(order.providerOrderId, /^mock_order_APG-2026-0042_/);
    assert.equal(order.amountPaise, 50_00);
    assert.equal(order.receipt, 'APG-2026-0042');
  });

  it('verifyWebhook accepts a well-formed payment_succeeded event', () => {
    const body = JSON.stringify({
      kind: 'payment_succeeded',
      providerPaymentId: 'mock_pay_xyz',
      providerOrderId: 'mock_order_xyz',
      amountPaise: 5_00_000,
      receipt: 'APG-2026-0042',
    });
    const r = mockProvider.verifyWebhook({ rawBody: body, signature: null });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.event.kind, 'payment_succeeded');
    }
  });

  it('verifyWebhook rejects malformed JSON', () => {
    const r = mockProvider.verifyWebhook({ rawBody: '{', signature: null });
    assert.equal(r.ok, false);
  });

  it('refund returns a deterministic-shape refund id', async () => {
    const r = await mockProvider.refund({
      providerPaymentId: 'mock_pay_abc12345',
      amountPaise: 1_00_000,
    });
    assert.match(r.providerRefundId, /^mock_rfnd_/);
    assert.equal(r.amountPaise, 1_00_000);
    assert.equal(r.status, 'succeeded');
  });
});
