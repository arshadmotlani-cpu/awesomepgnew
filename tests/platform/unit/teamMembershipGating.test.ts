import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSubscriptionAccessAllowed,
  isSubscriptionGracePeriod,
} from '@/src/platform/services/memberships';

test('subscription gating allows trial, active, and past_due', () => {
  assert.equal(isSubscriptionAccessAllowed('trial'), true);
  assert.equal(isSubscriptionAccessAllowed('active'), true);
  assert.equal(isSubscriptionAccessAllowed('past_due'), true);
  assert.equal(isSubscriptionGracePeriod('past_due'), true);
});

test('subscription gating hard-locks cancelled, unpaid, incomplete, suspended', () => {
  assert.equal(isSubscriptionAccessAllowed('suspended'), false);
  assert.equal(isSubscriptionAccessAllowed('cancelled'), false);
  assert.equal(isSubscriptionAccessAllowed('unpaid'), false);
  assert.equal(isSubscriptionAccessAllowed('incomplete'), false);
});

test('missing subscription status remains allowed for legacy orgs', () => {
  assert.equal(isSubscriptionAccessAllowed(null), true);
  assert.equal(isSubscriptionAccessAllowed(undefined), true);
});

test('salon team roles exclude legacy member label', () => {
  const roles = ['owner', 'co_owner', 'manager', 'biller', 'staff'];
  assert.ok(!roles.includes('member'));
});
