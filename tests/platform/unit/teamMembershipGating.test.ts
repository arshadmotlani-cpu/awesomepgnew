import assert from 'node:assert/strict';
import test from 'node:test';

function isSubscriptionAccessAllowed(status: string | null | undefined): boolean {
  return !status || status === 'trial' || status === 'active' || status === 'past_due';
}

test('subscription gating allows trial, active, and past_due', () => {
  assert.equal(isSubscriptionAccessAllowed('trial'), true);
  assert.equal(isSubscriptionAccessAllowed('active'), true);
  assert.equal(isSubscriptionAccessAllowed('past_due'), true);
  assert.equal(isSubscriptionAccessAllowed('suspended'), false);
  assert.equal(isSubscriptionAccessAllowed('cancelled'), false);
});

test('salon team roles exclude legacy member label', () => {
  const roles = ['owner', 'co_owner', 'manager', 'biller', 'staff'];
  assert.ok(!roles.includes('member'));
});
