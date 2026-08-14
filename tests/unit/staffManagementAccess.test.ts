import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  canEditStaffProfiles,
  type StaffManagementAccess,
} from '@/src/hair/lib/auth/staffManagementAccess';
import {
  defaultGrantsForAccessRole,
  hasWorkforcePermission,
} from '@/src/workforce/permissions/presets';

describe('Staff management access — profile edit', () => {
  test('super_admin (null grants) can edit staff profiles', () => {
    const access: StaffManagementAccess = { canView: true, canAdd: true, grants: null };
    assert.equal(canEditStaffProfiles(access), true);
  });

  test('manager with staff.edit can edit staff profiles', () => {
    const grants = defaultGrantsForAccessRole('manager');
    const access: StaffManagementAccess = { canView: true, canAdd: true, grants };
    assert.ok(hasWorkforcePermission(grants, 'staff.edit'));
    assert.equal(canEditStaffProfiles(access), true);
  });

  test('staff without staff.edit cannot edit staff profiles', () => {
    const grants = defaultGrantsForAccessRole('staff');
    const access: StaffManagementAccess = { canView: true, canAdd: false, grants };
    assert.equal(hasWorkforcePermission(grants, 'staff.edit'), false);
    assert.equal(canEditStaffProfiles(access), false);
  });
});

describe('Staff profile UI contracts', () => {
  test('employee profile page uses canEditStaffProfiles helper', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const pageSrc = readFileSync(
      join(process.cwd(), 'app/(hair)/fyh/(app)/staff/[employeeId]/page.tsx'),
      'utf8',
    );
    assert.match(pageSrc, /canEditStaffProfiles\(access\)/);
    assert.doesNotMatch(pageSrc, /hasWorkforcePermission\(access\.grants, 'staff\.edit'\)/);
  });

  test('EmployeeProfilePanel staff-details fields bind disabled to canEdit', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const profileSrc = readFileSync(
      join(process.cwd(), 'src/workforce/components/EmployeeProfilePanel.tsx'),
      'utf8',
    );
    const staffBlock = profileSrc.split("activeSection === 'staff-details'")[1]?.split(
      "activeSection === 'credentials'",
    )[0];
    assert.ok(staffBlock);
    assert.match(staffBlock!, /name="fullName"/);
    assert.match(staffBlock!, /disabled=\{!canEdit\}/);
    assert.match(profileSrc, /name="saveSection"/);
  });

  test('updateWorkforceEmployeeAction returns section-specific success messages', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/workforce/actions/employees.ts'), 'utf8');
    assert.match(src, /'staff-details': 'Staff details saved\.'/);
    assert.match(src, /requireWorkforcePermission\('staff\.edit'\)/);
  });
});
