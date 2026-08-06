import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HAIR_PERMISSIONS,
  ROLE_PRESETS,
  hasPermission,
  pagePermissionForPath,
  resolvePermissions,
} from '../../../src/hair/lib/auth/permissionTypes.ts';

const baseAdmin = {
  id: 'a1',
  email: 'desk@fyh.test',
  passwordHash: 'x',
  displayName: 'Desk',
  role: 'admin' as const,
  permissions: [] as typeof HAIR_PERMISSIONS[number][],
  lastLoginAt: null,
  createdAt: new Date(),
};

const superAdmin = { ...baseAdmin, role: 'super_admin' as const, email: 'owner@fyh.test' };

test('super_admin has every catalog permission', () => {
  for (const key of HAIR_PERMISSIONS) {
    assert.equal(hasPermission(superAdmin, key), true);
  }
});

test('admin preset grants front-desk pages and checkout', () => {
  assert.equal(hasPermission(baseAdmin, 'page:dashboard'), true);
  assert.equal(hasPermission(baseAdmin, 'page:customers'), true);
  assert.equal(hasPermission(baseAdmin, 'page:appointments'), true);
  assert.equal(hasPermission(baseAdmin, 'page:billing'), true);
  assert.equal(hasPermission(baseAdmin, 'page:quick_sale'), true);
  assert.equal(hasPermission(baseAdmin, 'action:billing.checkout'), true);
});

test('admin preset denies inventory, reports, settings, and sensitive actions', () => {
  assert.equal(hasPermission(baseAdmin, 'page:inventory'), false);
  assert.equal(hasPermission(baseAdmin, 'page:reports'), false);
  assert.equal(hasPermission(baseAdmin, 'page:settings'), false);
  assert.equal(hasPermission(baseAdmin, 'action:inventory.adjust'), false);
  assert.equal(hasPermission(baseAdmin, 'action:reports.export'), false);
  assert.equal(hasPermission(baseAdmin, 'action:settings.edit'), false);
  assert.equal(hasPermission(baseAdmin, 'action:staff.commission_pay'), false);
});

test('custom permissions jsonb overrides role preset', () => {
  const custom = {
    ...baseAdmin,
    permissions: ['page:reports'] as typeof HAIR_PERMISSIONS[number][],
  };
  assert.equal(hasPermission(custom, 'page:reports'), true);
  assert.equal(hasPermission(custom, 'page:dashboard'), false);
  assert.deepEqual([...resolvePermissions(custom)].sort(), ['page:reports']);
});

test('pagePermissionForPath maps public and internal routes', () => {
  assert.equal(pagePermissionForPath('/inventory'), 'page:inventory');
  assert.equal(pagePermissionForPath('/expenses'), 'page:expenses');
  assert.equal(pagePermissionForPath('/fyh/reports/revenue/daily'), 'page:reports');
  assert.equal(pagePermissionForPath('/services'), 'page:settings');
  assert.equal(pagePermissionForPath('/settings/permissions'), 'page:settings');
});

test('ROLE_PRESETS admin matches documented front-desk bundle', () => {
  assert.deepEqual([...ROLE_PRESETS.admin].sort(), [
    'action:billing.checkout',
    'page:appointments',
    'page:billing',
    'page:customers',
    'page:dashboard',
    'page:quick_sale',
  ]);
});
