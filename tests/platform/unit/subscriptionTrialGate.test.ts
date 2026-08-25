import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSubscriptionAccessAllowed } from '@/src/platform/services/memberships';
import {
  TRIAL_LENGTH_DAYS,
  computeTrialPeriod,
  formatTrialAdminLabel,
  resolveCreateSubscriptionPeriod,
} from '@/src/platform/lib/subscriptionTrial';

const root = process.cwd();

test('trial orgs get a 30-day default period at create', () => {
  const now = new Date('2026-08-24T07:00:00.000Z');
  const period = resolveCreateSubscriptionPeriod({
    subscriptionStatus: 'trial',
    now,
  });
  assert.equal(period.currentPeriodStart.toISOString(), now.toISOString());
  assert.equal(period.currentPeriodEnd?.toISOString(), '2026-09-23T07:00:00.000Z');
});

test('trial create respects an explicit override date', () => {
  const period = resolveCreateSubscriptionPeriod({
    subscriptionStatus: 'trial',
    trialEndsAt: '2026-09-30',
    now: new Date('2026-08-24T07:00:00.000Z'),
  });
  assert.ok(period.currentPeriodEnd);
  assert.equal(period.currentPeriodEnd?.toISOString().startsWith('2026-09-30'), true);
});

test('computeTrialPeriod stays fixed at 30 days', () => {
  const period = computeTrialPeriod(new Date('2026-08-24T07:00:00.000Z'));
  assert.equal(TRIAL_LENGTH_DAYS, 30);
  assert.equal(period.end.toISOString(), '2026-09-23T07:00:00.000Z');
});

test('complimentary access is permanent regardless of period end', () => {
  const past = new Date('2020-01-01T00:00:00.000Z');
  const now = new Date('2026-08-25T07:00:00.000Z');
  assert.equal(
    isSubscriptionAccessAllowed('complimentary', { currentPeriodEnd: past, now }),
    true,
  );
  assert.equal(isSubscriptionAccessAllowed('complimentary', { currentPeriodEnd: null }), true);
});

test('complimentary create has no period end', () => {
  const now = new Date('2026-08-24T07:00:00.000Z');
  const period = resolveCreateSubscriptionPeriod({
    subscriptionStatus: 'complimentary',
    trialEndsAt: '2026-09-01',
    now,
  });
  assert.equal(period.currentPeriodStart.toISOString(), now.toISOString());
  assert.equal(period.currentPeriodEnd, null);
});

test('trial orgs still expire after period end', () => {
  const future = new Date('2026-09-23T07:00:00.000Z');
  const past = new Date('2026-08-20T07:00:00.000Z');
  const now = new Date('2026-08-24T07:00:00.000Z');
  assert.equal(isSubscriptionAccessAllowed('trial', { currentPeriodEnd: future, now }), true);
  assert.equal(isSubscriptionAccessAllowed('trial', { currentPeriodEnd: past, now }), false);
});

test('legacy trial rows with no end date stay allowed', () => {
  assert.equal(isSubscriptionAccessAllowed('trial', { currentPeriodEnd: null }), true);
});

test('admin label shows remaining days, expired state, and complimentary', () => {
  const now = new Date('2026-08-24T07:00:00.000Z');
  assert.equal(
    formatTrialAdminLabel('trial', new Date('2026-08-28T07:00:00.000Z'), now),
    '4 days left',
  );
  assert.equal(
    formatTrialAdminLabel('trial', new Date('2026-08-20T07:00:00.000Z'), now),
    'Trial expired - awaiting payment',
  );
  assert.equal(
    formatTrialAdminLabel('complimentary', new Date('2020-01-01T00:00:00.000Z'), now),
    'Complimentary — no billing',
  );
});

test('manual approval path still converts subscriptions to active without trial special-casing', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/platform/services/manualSubscriptionPayments.ts'),
    'utf8',
  );
  assert.match(src, /status:\s*'active'/);
  assert.match(src, /currentPeriodStart:\s*periodStart/);
  assert.match(src, /currentPeriodEnd:\s*periodEnd/);
  assert.doesNotMatch(src, /subscription\.status\s*===\s*'trial'/);
  assert.match(src, /Complimentary organizations do not submit payment/);
});

test('complimentary orgs never land on /subscribe paywall; trial orgs still can', () => {
  const subscribePage = readFileSync(
    join(root, 'app/(hair)/fyh/(public)/subscribe/page.tsx'),
    'utf8',
  );
  const subscribeAction = readFileSync(join(root, 'src/hair/actions/subscribe.ts'), 'utf8');
  const layout = readFileSync(join(root, 'app/(hair)/fyh/(app)/layout.tsx'), 'utf8');
  assert.match(subscribePage, /isComplimentarySubscription/);
  assert.match(subscribePage, /redirect\('\/dashboard\/revenue'\)/);
  assert.match(subscribeAction, /isComplimentarySubscription/);
  assert.match(layout, /isOrganizationSubscriptionLocked/);

  const orgDetail = readFileSync(
    join(root, 'app/(platform)/platform/admin/organizations/[id]/page.tsx'),
    'utf8',
  );
  assert.match(orgDetail, /Complimentary — no billing/);
  assert.match(orgDetail, /Custom annual price/);

  const migration = readFileSync(
    join(root, 'src/platform/db/migrations/0006_complimentary_subscription.sql'),
    'utf8',
  );
  assert.match(migration, /'complimentary'::text/);
});
