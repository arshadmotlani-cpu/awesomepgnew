import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicInvoiceLookupAllowed } from '@/src/hair/services/invoices';

test('public invoice lookup requires tenant context in SaaS mode', () => {
  const prev = process.env.FYH_SAAS_TENANT;
  try {
    process.env.FYH_SAAS_TENANT = '1';
    assert.equal(isPublicInvoiceLookupAllowed(null), false);
    assert.equal(
      isPublicInvoiceLookupAllowed({
        userId: 'u1',
        organizationId: 'org1',
        locationId: 'loc1',
        membershipId: 'm1',
        membershipRole: 'owner',
        allowedLocationIds: ['loc1'],
        permissions: [],
      }),
      true,
    );
  } finally {
    if (prev === undefined) delete process.env.FYH_SAAS_TENANT;
    else process.env.FYH_SAAS_TENANT = prev;
  }
});

test('public invoice lookup keeps legacy mode without tenant context', () => {
  const prev = process.env.FYH_SAAS_TENANT;
  try {
    process.env.FYH_SAAS_TENANT = '0';
    assert.equal(isPublicInvoiceLookupAllowed(null), true);
  } finally {
    if (prev === undefined) delete process.env.FYH_SAAS_TENANT;
    else process.env.FYH_SAAS_TENANT = prev;
  }
});
