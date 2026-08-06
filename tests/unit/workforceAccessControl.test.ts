/**
 * Access control architecture tests — permission library + template separation.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { WORKFORCE_ACCESS_ROLES, WORKFORCE_PERMISSION_LIBRARY } from '@/src/workforce/types';
import { normalizeAccessRole } from '@/src/workforce/accessRoles';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';
import { workforceAccessRoleLabel } from '@/src/workforce/labels';

describe('Workforce permission library', () => {
  test('library includes core modules', () => {
    const keys = new Set(WORKFORCE_PERMISSION_LIBRARY.map((p) => p.key));
    assert.ok(keys.has('customers.view'));
    assert.ok(keys.has('inventory.view'));
    assert.ok(keys.has('permissions.manage'));
    assert.ok(keys.size >= 40);
  });

  test('only four access roles in product UI', () => {
    assert.deepEqual([...WORKFORCE_ACCESS_ROLES], ['owner', 'manager', 'biller', 'staff']);
  });

  test('legacy stylist maps to staff template', () => {
    assert.equal(normalizeAccessRole('stylist'), 'staff');
    assert.equal(workforceAccessRoleLabel('stylist'), 'Staff');
    const staff = codeTemplateForAccessRole('staff');
    assert.ok(hasWorkforcePermission(staff, 'appointments.view_own'));
    assert.equal(hasWorkforcePermission(staff, 'staff.view'), false);
  });

  test('biller template gets billing without staff management', () => {
    const biller = codeTemplateForAccessRole('biller');
    assert.ok(hasWorkforcePermission(biller, 'billing.create_invoice'));
    assert.ok(hasWorkforcePermission(biller, 'packages.view'));
    assert.equal(hasWorkforcePermission(biller, 'staff.view'), false);
    assert.equal(hasWorkforcePermission(biller, 'permissions.manage'), false);
  });

  test('owner template grants permissions.manage', () => {
    const owner = codeTemplateForAccessRole('owner');
    assert.ok(hasWorkforcePermission(owner, 'permissions.manage'));
    assert.ok(hasWorkforcePermission(owner, 'system.settings'));
  });
});
