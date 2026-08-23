import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSubscriptionAccessAllowed,
  isSubscriptionGracePeriod,
} from '@/src/platform/services/memberships';
import { mapStripeSubscriptionStatus } from '@/src/platform/billing/stripe/client';

test('E1 successful subscribe path maps to active access', () => {
  const status = mapStripeSubscriptionStatus('active');
  assert.equal(status, 'active');
  assert.equal(isSubscriptionAccessAllowed(status), true);
});

test('E2 failed / incomplete checkout hard-locks ERP', () => {
  for (const s of ['incomplete', 'unpaid', 'canceled', 'incomplete_expired'] as const) {
    const mapped = mapStripeSubscriptionStatus(s);
    assert.equal(isSubscriptionAccessAllowed(mapped), false, s);
  }
});

test('E3 payment_failed → past_due grace still allows access', () => {
  const status = mapStripeSubscriptionStatus('past_due');
  assert.equal(isSubscriptionAccessAllowed(status), true);
  assert.equal(isSubscriptionGracePeriod(status), true);
});

test('E4 subscription.deleted → cancelled hard lock', () => {
  const status = mapStripeSubscriptionStatus('canceled');
  assert.equal(status, 'cancelled');
  assert.equal(isSubscriptionAccessAllowed(status), false);
});
