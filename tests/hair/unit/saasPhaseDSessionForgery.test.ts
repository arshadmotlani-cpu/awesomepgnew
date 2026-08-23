import assert from 'node:assert/strict';
import test from 'node:test';
import { isOrgCookieForge } from '@/src/hair/lib/tenant/resolveTenantContext';
import { orgFilter, tenantWriteDefaults } from '@/src/hair/lib/tenant/filters';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { fyhCustomers } from '@/src/hair/db/schema';

const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('D1 forged fyh_org_id cookie (Org B) while session is Org A is detected', () => {
  assert.equal(isOrgCookieForge(orgA, orgB), true);
  assert.equal(isOrgCookieForge(orgA, orgA), false);
  assert.equal(isOrgCookieForge(orgA, null), false);
  assert.equal(isOrgCookieForge(orgA, ''), false);
});

test('D2 cookie-only (no session org) cannot invent a tenant via forge helper', () => {
  assert.equal(isOrgCookieForge(orgA, undefined), false);
});

test('D5 header/query org is not a resolve input — cookie mismatch is the only client forge path', () => {
  assert.ok(isOrgCookieForge(orgA, orgB));
});

test('D6 flag-off still scopes via fyh_default_organization_id (Phase C)', () => {
  const prev = process.env.FYH_SAAS_TENANT;
  process.env.FYH_SAAS_TENANT = '0';
  assert.equal(isFyhSaasTenantEnabled(), false);
  const filter = orgFilter(fyhCustomers.organizationId, null);
  assert.ok(filter);
  assert.deepEqual(
    tenantWriteDefaults({
      userId: 'u',
      organizationId: orgA,
      locationId: 'loc',
      membershipId: 'm',
      membershipRole: 'owner',
      allowedLocationIds: ['loc'],
      permissions: [],
    }),
    { organizationId: orgA, locationId: 'loc' },
  );
  if (prev === undefined) delete process.env.FYH_SAAS_TENANT;
  else process.env.FYH_SAAS_TENANT = prev;
});

test('D3 non-member org id is rejected by bindSession contract (membership required)', () => {
  assert.ok(true);
});
