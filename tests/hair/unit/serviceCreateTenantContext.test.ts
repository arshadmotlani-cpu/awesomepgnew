import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { orgFilter, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { fyhServices } from '@/src/hair/db/schema';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function fnBody(src: string, exportName: string): string {
  const start = src.indexOf(`export async function ${exportName}`);
  assert.ok(start >= 0, `missing ${exportName}`);
  const next = src.indexOf('export async function', start + 1);
  return src.slice(start, next > start ? next : start + 2500);
}

const fyhCtx = {
  userId: 'user-billing',
  organizationId: 'org-fyh',
  locationId: 'loc-fyh-1',
  membershipId: 'mem-billing',
  membershipRole: 'biller' as const,
  allowedLocationIds: ['loc-fyh-1'],
  permissions: ['page:services'] as const,
};

const otherOrgCtx = {
  ...fyhCtx,
  organizationId: 'org-other',
  membershipId: 'mem-other',
};

describe('FYHAIR service CRUD tenant context', () => {
  it('createServiceAction resolves tenant before createService', () => {
    const actions = read('src/hair/actions/services.ts');
    const fn = fnBody(actions, 'createServiceAction');
    assert.match(fn, /getTenantContextForAction\(\)/);
    assert.match(fn, /createService\([\s\S]*ctx/);
  });

  it('update/archive/restore/delete actions pass tenant ctx into salonServices', () => {
    const actions = read('src/hair/actions/services.ts');
    for (const name of [
      'updateServiceAction',
      'archiveServiceAction',
      'restoreServiceAction',
      'deleteServiceAction',
    ]) {
      const fn = fnBody(actions, name);
      assert.match(fn, /getTenantContextForAction\(\)/, `${name} must resolve tenant`);
      assert.match(fn, /ctx/, `${name} must forward ctx`);
    }
  });

  it('createService resolves tenant and scopes insert + staff sync', () => {
    const svc = read('src/hair/services/salonServices.ts');
    const fn = fnBody(svc, 'createService');
    assert.match(fn, /resolveTenantContextForService\(ctx\)/);
    assert.match(fn, /tenantOrgDefaults\(ctx\)/);
    assert.match(fn, /assertUniqueServiceName\(name, undefined, ctx\)/);
    assert.match(fn, /syncStaff\(row\.id, input\.staffIds, ctx\)/);
  });

  it('updateService and deleteService resolve tenant and use orgFilter on writes', () => {
    const svc = read('src/hair/services/salonServices.ts');
    const update = fnBody(svc, 'updateService');
    assert.match(update, /resolveTenantContextForService\(ctx\)/);
    assert.match(update, /orgFilter\(fyhServices\.organizationId, ctx\)/);

    const del = fnBody(svc, 'deleteService');
    assert.match(del, /resolveTenantContextForService\(ctx\)/);
    assert.match(del, /getService\(id, ctx\)/);
    assert.match(del, /orgFilter\(fyhServices\.organizationId, ctx\)/);
  });

  it('listServices applies orgFilter for catalog listing', () => {
    const svc = read('src/hair/services/salonServices.ts');
    const fn = fnBody(svc, 'listServices');
    assert.match(fn, /resolveTenantContextForService\(ctx\)/);
    assert.match(fn, /orgFilter\(fyhServices\.organizationId, ctx\)/);
  });

  it('duplicate name check is org-scoped via orgFilter', () => {
    const svc = read('src/hair/services/salonServices.ts');
    assert.match(svc, /findServiceByNormalizedName[\s\S]*orgFilter\(fyhServices\.organizationId, ctx\)/);
  });

  it('missing tenant context fails closed under FYH_SAAS_TENANT (no unscoped write defaults)', () => {
    const prev = process.env.FYH_SAAS_TENANT;
    process.env.FYH_SAAS_TENANT = '1';
    try {
      assert.equal(isFyhSaasTenantEnabled(), true);
      assert.throws(
        () => tenantOrgDefaults(null),
        /Tenant context is required when FYH_SAAS_TENANT is enabled/,
      );
      assert.throws(
        () => orgFilter(fyhServices.organizationId, null),
        /Tenant context is required when FYH_SAAS_TENANT is enabled/,
      );
      assert.doesNotThrow(() => tenantOrgDefaults(fyhCtx));
      assert.doesNotThrow(() => orgFilter(fyhServices.organizationId, otherOrgCtx));
    } finally {
      if (prev === undefined) delete process.env.FYH_SAAS_TENANT;
      else process.env.FYH_SAAS_TENANT = prev;
    }
  });

  it('serviceContext reuses canonical resolveTenantContextOptional for actions', () => {
    const helper = read('src/hair/lib/tenant/serviceContext.ts');
    assert.match(helper, /resolveTenantContextOptional\(\)/);
    assert.match(helper, /getTenantContextForPage/);
  });
});
