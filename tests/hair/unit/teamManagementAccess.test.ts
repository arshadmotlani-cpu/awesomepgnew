import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowedAssignRolesForMembershipRole,
  canAssignTeamRole,
  teamCapsForMembershipRole,
} from '@/src/hair/lib/auth/teamManagementAccess';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';

test('owner and co_owner can assign all operational roles including co_owner', () => {
  assert.deepEqual(allowedAssignRolesForMembershipRole('owner'), [
    'owner',
    'co_owner',
    'manager',
    'receptionist',
    'biller',
    'staff',
  ]);
  assert.deepEqual(allowedAssignRolesForMembershipRole('co_owner'), [
    'owner',
    'co_owner',
    'manager',
    'receptionist',
    'biller',
    'staff',
  ]);
  assert.equal(canAssignTeamRole('owner', 'co_owner'), true);
  assert.equal(canAssignTeamRole('co_owner', 'manager'), true);
});

test('manager cannot assign owner or co_owner', () => {
  assert.deepEqual(allowedAssignRolesForMembershipRole('manager'), [
    'manager',
    'receptionist',
    'biller',
    'staff',
  ]);
  assert.equal(canAssignTeamRole('manager', 'owner'), false);
  assert.equal(canAssignTeamRole('manager', 'co_owner'), false);
  assert.equal(canAssignTeamRole('manager', 'biller'), true);
});

test('biller and staff cannot manage team', () => {
  assert.deepEqual(allowedAssignRolesForMembershipRole('biller'), []);
  assert.deepEqual(allowedAssignRolesForMembershipRole('staff'), []);
  const billerGrants = codeTemplateForAccessRole('biller');
  const staffGrants = codeTemplateForAccessRole('staff');
  assert.equal(teamCapsForMembershipRole('biller', billerGrants).canView, false);
  assert.equal(teamCapsForMembershipRole('staff', staffGrants).canView, false);
});

test('manager team caps follow workforce staff permissions', () => {
  const managerGrants = codeTemplateForAccessRole('manager');
  const caps = teamCapsForMembershipRole('manager', managerGrants);
  assert.equal(caps.canView, true);
  assert.equal(caps.canInvite, true);
  assert.equal(caps.canEdit, true);
  assert.equal(caps.canDeactivate, true);

  const limited = {
    permissions: managerGrants.permissions.filter(
      (key) => !key.startsWith('staff.'),
    ),
    maxBackdateDays: 0,
  };
  const limitedCaps = teamCapsForMembershipRole('manager', limited);
  assert.equal(limitedCaps.canView, false);
  assert.equal(limitedCaps.canInvite, false);
});

test('owner-level roles always have full team management caps', () => {
  const ownerCaps = teamCapsForMembershipRole('owner', null);
  assert.equal(ownerCaps.canView, true);
  assert.equal(ownerCaps.canInvite, true);
  assert.equal(ownerCaps.canEdit, true);
  assert.equal(ownerCaps.canDeactivate, true);
});
