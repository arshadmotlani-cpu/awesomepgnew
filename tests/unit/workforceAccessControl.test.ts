/**
 * Access control architecture tests — permission library + template separation.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { WORKFORCE_PERMISSION_LIBRARY } from '@/src/workforce/permissions/library';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';

describe('Workforce permission library', () => {
  test('library includes core modules', () => {
    const keys = new Set(WORKFORCE_PERMISSION_LIBRARY.map((p) => p.key));
    assert.ok(keys.has('customers.view'));
    assert.ok(keys.has('inventory.view'));
    assert.ok(keys.has('permissions.manage'));
    assert.ok(keys.has('billing.approve_refund'));
    assert.ok(keys.size >= 40);
  });

  test('receptionist template is independent of role name at runtime', () => {
    const base = codeTemplateForAccessRole('receptionist');
    assert.ok(hasWorkforcePermission(base, 'billing.create_invoice'));
    const extended = {
      permissions: [...base.permissions, 'inventory.view'],
      maxBackdateDays: base.maxBackdateDays,
    };
    assert.ok(hasWorkforcePermission(extended, 'inventory.view'));
    assert.equal(hasWorkforcePermission(base, 'inventory.view'), false);
  });

  test('owner template grants permissions.manage', () => {
    const owner = codeTemplateForAccessRole('owner');
    assert.ok(hasWorkforcePermission(owner, 'permissions.manage'));
    assert.ok(hasWorkforcePermission(owner, 'system.settings'));
  });
});
