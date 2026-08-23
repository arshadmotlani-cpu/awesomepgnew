import assert from 'node:assert/strict';
import test from 'node:test';
import { mapStripeSubscriptionStatus } from '@/src/platform/billing/stripe/client';

test('maps Stripe subscription statuses to Platform statuses', () => {
  assert.equal(mapStripeSubscriptionStatus('trialing'), 'trial');
  assert.equal(mapStripeSubscriptionStatus('active'), 'active');
  assert.equal(mapStripeSubscriptionStatus('past_due'), 'past_due');
  assert.equal(mapStripeSubscriptionStatus('unpaid'), 'unpaid');
  assert.equal(mapStripeSubscriptionStatus('incomplete'), 'incomplete');
  assert.equal(mapStripeSubscriptionStatus('incomplete_expired'), 'cancelled');
  assert.equal(mapStripeSubscriptionStatus('canceled'), 'cancelled');
  assert.equal(mapStripeSubscriptionStatus('cancelled'), 'cancelled');
  assert.equal(mapStripeSubscriptionStatus('paused'), 'suspended');
});
