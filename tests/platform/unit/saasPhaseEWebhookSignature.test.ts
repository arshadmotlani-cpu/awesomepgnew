import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';
import { constructStripeEvent } from '@/src/platform/billing/stripe/webhook';

const WHSEC = 'whsec_test_phase_e_signature_verify_only';

test('missing Stripe-Signature is rejected', () => {
  process.env.PLATFORM_STRIPE_SECRET_KEY = 'sk_test_phase_e_sig';
  process.env.PLATFORM_STRIPE_WEBHOOK_SECRET = WHSEC;
  assert.throws(() => constructStripeEvent('{}', null), /Missing Stripe-Signature/);
});

test('invalid Stripe-Signature is rejected', () => {
  process.env.PLATFORM_STRIPE_SECRET_KEY = 'sk_test_phase_e_sig';
  process.env.PLATFORM_STRIPE_WEBHOOK_SECRET = WHSEC;
  assert.throws(
    () => constructStripeEvent('{"id":"evt_x"}', 't=1,v1=deadbeef'),
    /Error|Signature|stripe/i,
  );
});

test('valid generated Stripe-Signature is accepted', () => {
  process.env.PLATFORM_STRIPE_SECRET_KEY = 'sk_test_phase_e_sig';
  process.env.PLATFORM_STRIPE_WEBHOOK_SECRET = WHSEC;
  const payload = JSON.stringify({
    id: 'evt_sig_ok',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test' } },
  });
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WHSEC,
  });
  const event = constructStripeEvent(payload, header);
  assert.equal(event.id, 'evt_sig_ok');
  assert.equal(event.type, 'checkout.session.completed');
});
