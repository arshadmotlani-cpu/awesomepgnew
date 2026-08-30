/**
 * Receptionist role authorization — workforce templates, hair bridge, nav, and route guards.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { WORKFORCE_ACCESS_ROLES } from '@/src/workforce/types';
import { normalizeAccessRole } from '@/src/workforce/accessRoles';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';
import { workforceGrantsToHairPermissions } from '@/src/workforce/compat/hairAdminBridge';
import { workforceAccessRoleLabel } from '@/src/workforce/labels';
import {
  hasPermission,
  pagePermissionForPath,
  type PermissionAdmin,
} from '@/src/hair/lib/auth/permissionTypes';
import {
  allowedAssignRolesForMembershipRole,
  canAssignTeamRole,
  teamCapsForMembershipRole,
} from '@/src/hair/lib/auth/teamManagementAccess';
import {
  FRONT_DESK_NAV_ENTRIES,
  isFrontDeskNavProfile,
  resolveNavEntries,
} from '@/src/hair/lib/nav';
import { defaultGrantsForAccessRole } from '@/src/workforce/permissions/presets';

function hairAdminFromRole(role: 'owner' | 'manager' | 'receptionist' | 'biller' | 'staff'): PermissionAdmin {
  const grants = codeTemplateForAccessRole(role);
  return {
    role: role === 'owner' ? 'super_admin' : 'admin',
    permissions: workforceGrantsToHairPermissions(grants),
  };
}

describe('Receptionist access role', () => {
  test('receptionist is a first-class workforce access role', () => {
    assert.deepEqual([...WORKFORCE_ACCESS_ROLES], [
      'owner',
      'manager',
      'receptionist',
      'biller',
      'staff',
    ]);
    assert.equal(normalizeAccessRole('receptionist'), 'receptionist');
    assert.equal(workforceAccessRoleLabel('receptionist'), 'Receptionist');
  });

  test('receptionist template grants front-desk permissions only', () => {
    const g = codeTemplateForAccessRole('receptionist');
    assert.equal(g.maxBackdateDays, 0);

    assert.ok(hasWorkforcePermission(g, 'customers.view'));
    assert.ok(hasWorkforcePermission(g, 'customers.edit'));
    assert.ok(hasWorkforcePermission(g, 'appointments.view_all'));
    assert.ok(hasWorkforcePermission(g, 'appointments.edit'));
    assert.ok(hasWorkforcePermission(g, 'billing.view'));
    assert.ok(hasWorkforcePermission(g, 'billing.create_invoice'));
    assert.ok(hasWorkforcePermission(g, 'services.view'));
    assert.ok(hasWorkforcePermission(g, 'packages.view'));
    assert.ok(hasWorkforcePermission(g, 'memberships.view'));
    assert.ok(hasWorkforcePermission(g, 'dashboard.view'));
    assert.ok(hasWorkforcePermission(g, 'dashboard.view_customers'));

    assert.equal(hasWorkforcePermission(g, 'billing.edit_invoice'), false);
    assert.equal(hasWorkforcePermission(g, 'billing.backdate_invoice'), false);
    assert.equal(hasWorkforcePermission(g, 'billing.approve_refund'), false);
    assert.equal(hasWorkforcePermission(g, 'expenses.view'), false);
    assert.equal(hasWorkforcePermission(g, 'expenses.edit'), false);
    assert.equal(hasWorkforcePermission(g, 'inventory.view'), false);
    assert.equal(hasWorkforcePermission(g, 'staff.view'), false);
    assert.equal(hasWorkforcePermission(g, 'staff.add'), false);
    assert.equal(hasWorkforcePermission(g, 'settings.manage'), false);
    assert.equal(hasWorkforcePermission(g, 'permissions.manage'), false);
    assert.equal(hasWorkforcePermission(g, 'services.edit'), false);
    assert.equal(hasWorkforcePermission(g, 'packages.edit'), false);
    assert.equal(hasWorkforcePermission(g, 'memberships.edit'), false);
    assert.equal(hasWorkforcePermission(g, 'dashboard.view_revenue'), false);
    assert.equal(hasWorkforcePermission(g, 'dashboard.view_staff'), false);
    assert.equal(hasWorkforcePermission(g, 'reports.view'), false);
  });

  test('manager and biller templates are unchanged relative to receptionist', () => {
    const manager = codeTemplateForAccessRole('manager');
    const biller = codeTemplateForAccessRole('biller');
    assert.ok(hasWorkforcePermission(manager, 'staff.view'));
    assert.ok(hasWorkforcePermission(manager, 'expenses.view'));
    assert.ok(hasWorkforcePermission(biller, 'billing.edit_invoice'));
    assert.ok(hasWorkforcePermission(biller, 'expenses.view'));
    assert.equal(hasWorkforcePermission(manager, 'permissions.manage'), false);
  });

  test('owner retains full access', () => {
    const owner = codeTemplateForAccessRole('owner');
    assert.ok(hasWorkforcePermission(owner, 'permissions.manage'));
    assert.ok(hasWorkforcePermission(owner, 'system.settings'));
    assert.ok(hasWorkforcePermission(owner, 'inventory.edit'));
  });
});

describe('Receptionist hair permission bridge', () => {
  const receptionist = hairAdminFromRole('receptionist');
  const manager = hairAdminFromRole('manager');
  const owner = hairAdminFromRole('owner');

  test('receptionist can access front-desk pages', () => {
    assert.ok(hasPermission(receptionist, 'page:dashboard'));
    assert.ok(hasPermission(receptionist, 'page:customers'));
    assert.ok(hasPermission(receptionist, 'page:appointments'));
    assert.ok(hasPermission(receptionist, 'page:billing'));
    assert.ok(hasPermission(receptionist, 'page:memberships'));
    assert.ok(hasPermission(receptionist, 'page:packages'));
    assert.ok(hasPermission(receptionist, 'page:services'));
    assert.ok(hasPermission(receptionist, 'action:billing.checkout'));
  });

  test('receptionist cannot access admin surfaces', () => {
    assert.equal(hasPermission(receptionist, 'page:settings'), false);
    assert.equal(hasPermission(receptionist, 'page:inventory'), false);
    assert.equal(hasPermission(receptionist, 'page:purchases'), false);
    assert.equal(hasPermission(receptionist, 'page:expenses'), false);
    assert.equal(hasPermission(receptionist, 'page:reports'), false);
    assert.equal(hasPermission(receptionist, 'page:dashboard_revenue'), false);
    assert.equal(hasPermission(receptionist, 'page:dashboard_staff'), false);
    assert.equal(hasPermission(receptionist, 'action:settings.edit'), false);
    assert.equal(hasPermission(receptionist, 'action:inventory.adjust'), false);
    assert.equal(hasPermission(receptionist, 'action:reports.export'), false);
  });

  test('manager and owner retain broader access', () => {
    assert.ok(hasPermission(manager, 'page:expenses'));
    assert.ok(hasPermission(manager, 'page:dashboard_revenue'));
    assert.ok(hasPermission(owner, 'page:settings'));
    assert.ok(hasPermission(owner, 'action:settings.edit'));
  });
});

describe('Receptionist route guards', () => {
  test('restricted routes map to protected permissions', () => {
    assert.equal(pagePermissionForPath('/settings'), 'page:settings');
    assert.equal(pagePermissionForPath('/staff'), 'page:dashboard');
    assert.equal(pagePermissionForPath('/team'), 'page:dashboard');
    assert.equal(pagePermissionForPath('/inventory'), 'page:inventory');
    assert.equal(pagePermissionForPath('/purchases'), 'page:purchases');
    assert.equal(pagePermissionForPath('/expenses'), 'page:expenses');
    assert.equal(pagePermissionForPath('/reports'), 'page:reports');
    assert.equal(pagePermissionForPath('/dashboard/revenue'), 'page:dashboard_revenue');
    assert.equal(pagePermissionForPath('/dashboard/staff-performance'), 'page:dashboard_staff');
    assert.equal(pagePermissionForPath('/dashboard/front-desk'), 'page:dashboard');
    assert.equal(pagePermissionForPath('/memberships'), 'page:memberships');
    assert.equal(pagePermissionForPath('/packages'), 'page:packages');
    assert.equal(pagePermissionForPath('/services'), 'page:services');
    assert.equal(pagePermissionForPath('/profile'), null);
    assert.equal(pagePermissionForPath('/access-denied'), null);
  });
});

describe('Receptionist navigation', () => {
  test('front-desk profile uses simplified nav', () => {
    const receptionist = hairAdminFromRole('receptionist');
    assert.equal(isFrontDeskNavProfile(receptionist), true);
    const nav = resolveNavEntries(receptionist);
    const labels = nav.map((entry) => entry.label);
    assert.deepEqual(labels, FRONT_DESK_NAV_ENTRIES.map((entry) => entry.label));
    assert.equal(labels.includes('Settings'), false);
    assert.equal(labels.includes('Purchases'), false);
    assert.equal(labels.includes('Staff'), false);
  });

  test('manager keeps full admin nav', () => {
    const manager = hairAdminFromRole('manager');
    assert.equal(isFrontDeskNavProfile(manager), false);
    const nav = resolveNavEntries(manager);
    assert.ok(nav.some((entry) => entry.label === 'Settings' || entry.label === 'Configuration'));
  });
});

describe('Receptionist team management', () => {
  test('owner can assign receptionist role', () => {
    assert.ok(canAssignTeamRole('owner', 'receptionist'));
    assert.ok(allowedAssignRolesForMembershipRole('owner').includes('receptionist'));
  });

  test('manager can assign receptionist but not owner', () => {
    assert.ok(canAssignTeamRole('manager', 'receptionist'));
    assert.equal(canAssignTeamRole('manager', 'owner'), false);
    assert.ok(allowedAssignRolesForMembershipRole('manager').includes('receptionist'));
  });

  test('receptionist cannot manage team', () => {
    const grants = codeTemplateForAccessRole('receptionist');
    const caps = teamCapsForMembershipRole('receptionist', grants);
    assert.equal(caps.canView, false);
    assert.equal(caps.canInvite, false);
    assert.deepEqual(allowedAssignRolesForMembershipRole('receptionist'), []);
  });
});

describe('Tenant isolation signals', () => {
  test('receptionist grants do not include ecosystem or system permissions', () => {
    const g = defaultGrantsForAccessRole('receptionist');
    assert.equal(hasWorkforcePermission(g, 'ecosystem.owner_os'), false);
    assert.equal(hasWorkforcePermission(g, 'ecosystem.pg'), false);
    assert.equal(hasWorkforcePermission(g, 'system.settings'), false);
  });
});
