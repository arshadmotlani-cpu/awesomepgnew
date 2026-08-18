import assert from 'node:assert/strict';
import test from 'node:test';
import { FYH_ORG_COOKIE, FYH_LOCATION_COOKIE } from '@/src/hair/lib/tenant/cookies';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';

test('tenant cookie names match auth migration plan', () => {
  assert.equal(FYH_ORG_COOKIE, 'fyh_org_id');
  assert.equal(FYH_LOCATION_COOKIE, 'fyh_location_id');
});

test('FYH SaaS tenant flag defaults off for legacy salon behavior', () => {
  const prev = process.env.FYH_SAAS_TENANT;
  delete process.env.FYH_SAAS_TENANT;
  assert.equal(isFyhSaasTenantEnabled(), false);
  process.env.FYH_SAAS_TENANT = '0';
  assert.equal(isFyhSaasTenantEnabled(), false);
  process.env.FYH_SAAS_TENANT = '1';
  assert.equal(isFyhSaasTenantEnabled(), true);
  if (prev === undefined) delete process.env.FYH_SAAS_TENANT;
  else process.env.FYH_SAAS_TENANT = prev;
});
