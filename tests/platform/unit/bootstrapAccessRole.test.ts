import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePlatformAccessRoleFromWorkforce } from '@/src/platform/lib/bootstrapAccessRole';

test('resolvePlatformAccessRoleFromWorkforce maps workforce engine membership, not email', () => {
  assert.equal(
    resolvePlatformAccessRoleFromWorkforce({
      rank: 'team_member',
      jobRole: 'manager',
      isSystemProvider: false,
    }),
    'manager',
  );
  assert.equal(
    resolvePlatformAccessRoleFromWorkforce({
      rank: 'owner',
      jobRole: 'owner',
      isSystemProvider: false,
    }),
    'owner',
  );
  assert.equal(
    resolvePlatformAccessRoleFromWorkforce({
      rank: 'team_member',
      jobRole: 'biller',
      isSystemProvider: false,
    }),
    'biller',
  );
  assert.equal(
    resolvePlatformAccessRoleFromWorkforce({
      rank: 'team_member',
      jobRole: 'stylist',
      isSystemProvider: false,
    }),
    'staff',
  );
});

test('resolvePlatformAccessRoleFromWorkforce ignores email-like legacy admin unless super_admin', () => {
  assert.equal(
    resolvePlatformAccessRoleFromWorkforce({
      rank: 'team_member',
      jobRole: 'staff',
      legacyAdminRole: 'admin',
    }),
    'staff',
  );
  assert.equal(
    resolvePlatformAccessRoleFromWorkforce({
      rank: 'team_member',
      jobRole: 'staff',
      legacyAdminRole: 'super_admin',
    }),
    'owner',
  );
  assert.equal(
    resolvePlatformAccessRoleFromWorkforce({
      rank: 'team_member',
      jobRole: 'staff',
      isSystemProvider: true,
    }),
    'owner',
  );
});
