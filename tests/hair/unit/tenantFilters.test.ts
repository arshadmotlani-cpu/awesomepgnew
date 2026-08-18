import assert from 'node:assert/strict';
import test from 'node:test';
import { orgFilter, tenantWriteDefaults } from '@/src/hair/lib/tenant/filters';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { fyhCustomers } from '@/src/hair/db/schema';

test('tenant filters are no-ops when FYH_SAAS_TENANT=0', () => {
  const prev = process.env.FYH_SAAS_TENANT;
  process.env.FYH_SAAS_TENANT = '0';
  assert.equal(isFyhSaasTenantEnabled(), false);
  assert.equal(orgFilter(fyhCustomers.organizationId, {
    userId: 'u',
    organizationId: 'org',
    locationId: 'loc',
    membershipId: 'm',
    membershipRole: 'owner',
    allowedLocationIds: ['loc'],
    permissions: [],
  }), undefined);
  assert.deepEqual(tenantWriteDefaults({
    userId: 'u',
    organizationId: 'org',
    locationId: 'loc',
    membershipId: 'm',
    membershipRole: 'owner',
    allowedLocationIds: ['loc'],
    permissions: [],
  }), {});
  process.env.FYH_SAAS_TENANT = prev;
});

test('tenant filters apply when FYH_SAAS_TENANT=1', () => {
  const prev = process.env.FYH_SAAS_TENANT;
  process.env.FYH_SAAS_TENANT = '1';
  const ctx = {
    userId: 'user-1',
    organizationId: 'org-1',
    locationId: 'loc-1',
    membershipId: 'mem-1',
    membershipRole: 'owner' as const,
    allowedLocationIds: ['loc-1'],
    permissions: [] as const,
  };
  assert.equal(isFyhSaasTenantEnabled(), true);
  const filter = orgFilter(fyhCustomers.organizationId, ctx);
  assert.ok(filter);
  assert.deepEqual(tenantWriteDefaults(ctx), {
    organizationId: 'org-1',
    locationId: 'loc-1',
  });
  process.env.FYH_SAAS_TENANT = prev;
});
