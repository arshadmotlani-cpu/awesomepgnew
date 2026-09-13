import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';
import {
  grantsAllowPath,
  resolveDefaultLandingPathForGrants,
  v2PermissionForPath,
} from '@/src/workforce/permissions/pagePermissions';
import {
  hairPublicToInternal,
  isHairProtectedPath,
  isHairPublicPath,
} from '@/src/hair/lib/host';

describe('FYHAIR billing (biller) workforce authorization', () => {
  const biller = codeTemplateForAccessRole('biller');

  test('biller can access Quick Sale and billing but not revenue dashboard', () => {
    assert.ok(hasWorkforcePermission(biller, 'quick_sale.access'));
    assert.ok(hasWorkforcePermission(biller, 'billing.invoice.view'));
    assert.equal(hasWorkforcePermission(biller, 'dashboard.view_revenue'), false);
    assert.equal(v2PermissionForPath('/dashboard/revenue'), 'dashboard.view_revenue');
    assert.equal(grantsAllowPath(biller, '/dashboard/revenue'), false);
    assert.ok(grantsAllowPath(biller, '/quick-sale'));
    assert.ok(grantsAllowPath(biller, '/billing/invoices'));
  });

  test('biller default landing is Quick Sale not revenue dashboard', () => {
    assert.equal(resolveDefaultLandingPathForGrants(biller), '/quick-sale');
  });

  test('owner template includes revenue dashboard', () => {
    const owner = codeTemplateForAccessRole('owner');
    assert.ok(grantsAllowPath(owner, '/dashboard/revenue'));
    assert.equal(resolveDefaultLandingPathForGrants(owner), '/quick-sale');
  });
});

describe('access-denied route is routable on fyhair host', () => {
  test('/access-denied is public and rewrites to internal app route', () => {
    assert.equal(isHairPublicPath('/access-denied'), true);
    assert.equal(isHairProtectedPath('/access-denied'), true);
    assert.equal(hairPublicToInternal('/access-denied'), '/fyh/access-denied');
  });
});
