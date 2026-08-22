import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideSelectOrganizationNavigation,
  detectRedirectCycle,
  isPersistedTenantSelection,
  pickResolvableMembership,
  simulateSelectOrgDashboardHops,
} from '../../../src/hair/lib/tenant/selectOrganizationNav.ts';

const orgA = {
  organizationId: 'org-a',
  allowedLocationIds: ['loc-main'],
};
const orgB = {
  organizationId: 'org-b',
  allowedLocationIds: ['loc-b'],
};
const orgNoLoc = {
  organizationId: 'org-empty',
  allowedLocationIds: [] as string[],
};

test('A: one valid organization picks that org without relying on cookie presence', () => {
  assert.deepEqual(pickResolvableMembership([orgA], undefined), orgA);
  const hops = simulateSelectOrgDashboardHops({
    tenantResolved: true,
    autoRedirectWhenUnresolved: false,
  });
  assert.equal(hops.at(-1), '/dashboard/revenue');
  assert.equal(detectRedirectCycle(hops), false);
});

test('B: stale fyh_org_id recovers the real single membership', () => {
  assert.deepEqual(pickResolvableMembership([orgA], 'stale-org-id'), orgA);
});

test('C: multiple organizations with no cookie stay on select-organization', () => {
  assert.equal(pickResolvableMembership([orgA, orgB], null), null);
  const decision = decideSelectOrganizationNavigation({
    sessionPresent: true,
    tenantResolved: false,
    selectionPersisted: false,
    homePath: '/dashboard/revenue',
  });
  assert.deepEqual(decision, { action: 'render' });
});

test('C: selection of one of many orgs uses that cookie org', () => {
  assert.deepEqual(pickResolvableMembership([orgA, orgB], 'org-b'), orgB);
});

test('D: no session redirects to login once', () => {
  const decision = decideSelectOrganizationNavigation({
    sessionPresent: false,
    tenantResolved: false,
    selectionPersisted: false,
    homePath: '/dashboard/revenue',
  });
  assert.deepEqual(decision, { action: 'redirect', to: '/login' });
});

test('E: unresolved tenant must not auto-hop select-org → dashboard (legacy cycle)', () => {
  const legacy = simulateSelectOrgDashboardHops({
    tenantResolved: false,
    autoRedirectWhenUnresolved: true,
  });
  assert.equal(detectRedirectCycle(legacy), true);
  assert.ok(legacy.includes('/select-organization'));
  assert.ok(legacy.includes('/dashboard/revenue'));

  const fixed = simulateSelectOrgDashboardHops({
    tenantResolved: false,
    autoRedirectWhenUnresolved: false,
  });
  assert.deepEqual(fixed, ['/select-organization']);
  assert.equal(detectRedirectCycle(fixed), false);
});

test('in-memory tenant without persisted cookies must not hop to dashboard', () => {
  const ctx = { organizationId: 'org-a', locationId: 'loc-main', allowedLocationIds: ['loc-main'] };
  assert.equal(isPersistedTenantSelection(ctx, undefined, undefined), false);
  assert.equal(isPersistedTenantSelection(ctx, 'stale', 'loc-main'), false);
  assert.equal(isPersistedTenantSelection(ctx, 'org-a', 'loc-main'), true);
  const decision = decideSelectOrganizationNavigation({
    sessionPresent: true,
    tenantResolved: true,
    selectionPersisted: false,
    homePath: '/dashboard/revenue',
  });
  assert.deepEqual(decision, { action: 'render' });
});

test('logged-in login must not send users to dashboard without persisted tenant cookies', () => {
  const decision = decideSelectOrganizationNavigation({
    sessionPresent: true,
    tenantResolved: true,
    selectionPersisted: false,
    homePath: '/dashboard/revenue',
  });
  assert.deepEqual(decision, { action: 'render' });
});

test('membership with no locations is not a resolved tenant', () => {
  assert.equal(pickResolvableMembership([orgNoLoc], 'org-empty'), null);
  assert.equal(pickResolvableMembership([orgNoLoc, orgA], 'org-empty'), orgA);
});

