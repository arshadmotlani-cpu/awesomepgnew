import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { permissionSatisfied, V2_TO_V1_ALIASES } from '@/src/workforce/permissions/aliases';
import { FYH_PERMISSION_CATALOG_V2 } from '@/src/workforce/permissions/catalogV2';
import {
  customerFieldMask,
  projectCustomerFields,
  projectStaffFields,
  staffFieldMask,
} from '@/src/workforce/permissions/fieldProjection';
import { grantsAllowPath, v2PermissionForPath } from '@/src/workforce/permissions/pagePermissions';
import { evaluateScope } from '@/src/workforce/permissions/scope';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { WORKFORCE_PERMISSION_KEYS } from '@/src/workforce/permissions/library';

describe('FYHAIR RBAC v2 catalog', () => {
  test('v2 keys are registered in merged permission library', () => {
    for (const def of FYH_PERMISSION_CATALOG_V2) {
      assert.ok(
        (WORKFORCE_PERMISSION_KEYS as readonly string[]).includes(def.key),
        `missing v2 key: ${def.key}`,
      );
    }
  });

  test('quick sale permissions are separate from package sell', () => {
    assert.ok(V2_TO_V1_ALIASES['quick_sale.package.redeem']);
    assert.ok(V2_TO_V1_ALIASES['packages.package.sell']);
    assert.notDeepEqual(
      V2_TO_V1_ALIASES['quick_sale.package.redeem'],
      V2_TO_V1_ALIASES['packages.package.sell'],
    );
  });
});

describe('permission alias resolution', () => {
  test('v1 billing.view satisfies billing.invoice.view', () => {
    assert.equal(permissionSatisfied(['billing.view'], 'billing.invoice.view'), true);
  });

  test('v2 quick_sale.access satisfied by billing.create_invoice', () => {
    assert.equal(permissionSatisfied(['billing.create_invoice'], 'quick_sale.access'), true);
  });

  test('staff template grants own salary via alias', () => {
    const staff = codeTemplateForAccessRole('staff');
    assert.equal(hasWorkforcePermission(staff, 'payroll.own.salary.view'), true);
    assert.equal(hasWorkforcePermission(staff, 'payroll.salary.view'), false);
  });

  test('biller template has quick sale access', () => {
    const biller = codeTemplateForAccessRole('biller');
    assert.equal(hasWorkforcePermission(biller, 'quick_sale.access'), true);
    assert.equal(hasWorkforcePermission(biller, 'quick_sale.package.redeem'), true);
  });
});

describe('scope evaluation', () => {
  const staffGrants = codeTemplateForAccessRole('staff');

  test('self scope allows own employee record', () => {
    assert.equal(
      evaluateScope({
        grants: staffGrants,
        permission: 'payroll.own.salary.view',
        scope: 'self',
        session: { workforceEmployeeId: 'emp-1', organizationId: 'org-1', locationId: null },
        resource: { type: 'employee', employeeId: 'emp-1' },
      }),
      true,
    );
  });

  test('self scope denies other employee record', () => {
    assert.equal(
      evaluateScope({
        grants: staffGrants,
        permission: 'payroll.own.salary.view',
        scope: 'self',
        session: { workforceEmployeeId: 'emp-1', organizationId: 'org-1', locationId: null },
        resource: { type: 'employee', employeeId: 'emp-2' },
      }),
      false,
    );
  });
});

describe('field projection', () => {
  test('customer phone redacted without customers.phone.view', () => {
    const grants = codeTemplateForAccessRole('staff');
    const mask = customerFieldMask(grants);
    const projected = projectCustomerFields({ phone: '9876543210', fullName: 'Test' }, mask);
    assert.notEqual(projected.phone, '9876543210');
  });

  test('customer phone visible with biller grants', () => {
    const grants = codeTemplateForAccessRole('biller');
    const mask = customerFieldMask(grants);
    assert.equal(mask.phone, true);
    const projected = projectCustomerFields({ phone: '9876543210', fullName: 'Test' }, mask);
    assert.equal(projected.phone, '9876543210');
  });

  test('staff banking redacted without staff.banking.view', () => {
    const grants = codeTemplateForAccessRole('receptionist');
    const mask = staffFieldMask(grants);
    const projected = projectStaffFields(
      { upiId: 'test@upi', fullName: 'Staff' },
      mask,
    );
    assert.equal(projected.upiId, null);
  });
});

describe('route permissions', () => {
  test('quick-sale maps to quick_sale.access', () => {
    assert.equal(v2PermissionForPath('/quick-sale'), 'quick_sale.access');
  });

  test('biller grants allow quick-sale route', () => {
    const biller = codeTemplateForAccessRole('biller');
    assert.equal(grantsAllowPath(biller, '/quick-sale'), true);
  });

  test('staff grants deny billing route', () => {
    const staff = codeTemplateForAccessRole('staff');
    assert.equal(grantsAllowPath(staff, '/billing'), false);
  });
});
