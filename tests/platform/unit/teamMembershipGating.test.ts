import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSubscriptionAccessAllowed,
  isSubscriptionGracePeriod,
} from '@/src/platform/services/memberships';

test('subscription gating allows trial, active, past_due, and complimentary', () => {
  assert.equal(isSubscriptionAccessAllowed('trial'), true);
  assert.equal(isSubscriptionAccessAllowed('active'), true);
  assert.equal(isSubscriptionAccessAllowed('past_due'), true);
  assert.equal(isSubscriptionAccessAllowed('complimentary'), true);
  assert.equal(isSubscriptionGracePeriod('past_due'), true);
  assert.equal(isSubscriptionGracePeriod('complimentary'), false);
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

test('salon team roles include receptionist and exclude legacy member label', () => {
  const roles = ['owner', 'co_owner', 'manager', 'receptionist', 'biller', 'staff'];
  assert.ok(!roles.includes('member'));
  assert.ok(roles.includes('receptionist'));
});
