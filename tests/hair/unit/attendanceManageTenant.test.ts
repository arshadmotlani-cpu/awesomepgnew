import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { orgFilter } from '@/src/hair/lib/tenant/filters';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { fyhStaff } from '@/src/hair/db/schema';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const ctx = {
  userId: 'user-1',
  organizationId: 'org-fyh-1',
  locationId: 'loc-1',
  membershipId: 'mem-1',
  membershipRole: 'owner' as const,
  allowedLocationIds: ['loc-1'],
  permissions: [] as const,
};

describe('Attendance manage tenant scoping', () => {
  it('loads staff roster with resolved tenant context on the manage page', () => {
    const page = read('app/(hair)/fyh/(app)/attendance/manage/page.tsx');
    assert.match(page, /getTenantContextForPage/);
    assert.match(page, /const ctx = await getTenantContextForPage\(\)/);
    assert.match(page, /listBookableStaffForSalon\(ctx\)/);
    assert.doesNotMatch(page, /listBookableStaffForSalon\(\)/);
  });

  it('rejects missing tenant context for staff roster queries when FYH_SAAS_TENANT=1', () => {
    const prev = process.env.FYH_SAAS_TENANT;
    process.env.FYH_SAAS_TENANT = '1';
    try {
      assert.equal(isFyhSaasTenantEnabled(), true);
      assert.throws(
        () => orgFilter(fyhStaff.organizationId, null),
        /Tenant context is required when FYH_SAAS_TENANT is enabled/,
      );
      assert.doesNotThrow(() => orgFilter(fyhStaff.organizationId, ctx));
    } finally {
      if (prev === undefined) delete process.env.FYH_SAAS_TENANT;
      else process.env.FYH_SAAS_TENANT = prev;
    }
  });
});
