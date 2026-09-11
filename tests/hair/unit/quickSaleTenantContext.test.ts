import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { orgFilter } from '@/src/hair/lib/tenant/filters';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { fyhCustomerPackages } from '@/src/hair/db/schema';

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

describe('Quick Sale tenant context for package credits and customer strip', () => {
  it('Available Services action resolves tenant before package credit query', () => {
    const actions = read('src/hair/actions/packages.ts');
    const fn = actions.slice(
      actions.indexOf('export async function listAvailablePackageServicesAction'),
      actions.indexOf('export async function', actions.indexOf('listAvailablePackageServicesAction') + 1),
    );
    assert.match(fn, /getTenantContextForAction/);
    assert.match(fn, /listActivePackageCreditsForCustomer\(hairDb, customerId, ctx\)/);
  });

  it('POS customer context action resolves tenant before booking context query', () => {
    const actions = read('src/hair/actions/booking.ts');
    const fn = actions.slice(
      actions.indexOf('export async function loadCustomerContextForPosAction'),
      actions.indexOf('export async function loadCustomerVisitHistoryAction'),
    );
    assert.match(fn, /getTenantContextForAction/);
    assert.match(fn, /getCustomerBookingContext\(customerId, ctx\)/);
  });

  it('booking context passes tenant into financial summary', () => {
    const svc = read('src/hair/services/bookingContext.ts');
    const fn = svc.slice(
      svc.indexOf('export async function getCustomerBookingContext'),
      svc.indexOf('export async function getCustomerVisitHistory'),
    );
    assert.match(fn, /getCustomerFinancialSummary\(customerId, ctx\)/);
  });

  it('customer context strip surfaces loader errors instead of fake Never/₹0', () => {
    const strip = read('src/hair/components/customers/FyhCustomerContextStrip.tsx');
    assert.match(strip, /setError/);
    assert.match(strip, /\.catch\(/);
    assert.match(strip, /text-fyh-warning/);
    assert.doesNotMatch(
      strip.slice(strip.indexOf('if (!ctx)')),
      /ctx\?\.financial\.walletPaise \?\? 0/,
    );
  });

  it('package credit queries stay org-scoped when FYH_SAAS_TENANT=1', () => {
    const prev = process.env.FYH_SAAS_TENANT;
    process.env.FYH_SAAS_TENANT = '1';
    try {
      assert.equal(isFyhSaasTenantEnabled(), true);
      assert.throws(
        () => orgFilter(fyhCustomerPackages.organizationId, null),
        /Tenant context is required when FYH_SAAS_TENANT is enabled/,
      );
      assert.doesNotThrow(() => orgFilter(fyhCustomerPackages.organizationId, ctx));
    } finally {
      if (prev === undefined) delete process.env.FYH_SAAS_TENANT;
      else process.env.FYH_SAAS_TENANT = prev;
    }
  });
});
