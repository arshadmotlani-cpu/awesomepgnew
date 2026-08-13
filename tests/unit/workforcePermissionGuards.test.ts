import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  defaultGrantsForAccessRole,
  hasWorkforcePermission,
  mapLegacyHairPermissions,
} from '@/src/workforce/permissions/presets';

describe('Workforce permission guards — staff.add authorization', () => {
  test('super_admin legacy grants include staff.add (ecosystem administrator)', () => {
    const grants = mapLegacyHairPermissions('super_admin', []);
    assert.ok(hasWorkforcePermission(grants, 'staff.add'));
    assert.ok(hasWorkforcePermission(grants, 'staff.edit'));
    assert.ok(hasWorkforcePermission(grants, 'permissions.manage'));
  });

  test('staff access role does not include staff.add', () => {
    const grants = defaultGrantsForAccessRole('staff');
    assert.equal(hasWorkforcePermission(grants, 'staff.add'), false);
    assert.equal(hasWorkforcePermission(grants, 'staff.edit'), false);
  });

  test('manager access role includes staff.add', () => {
    const grants = defaultGrantsForAccessRole('manager');
    assert.ok(hasWorkforcePermission(grants, 'staff.add'));
  });

  test('owner access role includes staff.add', () => {
    const grants = defaultGrantsForAccessRole('owner');
    assert.ok(hasWorkforcePermission(grants, 'staff.add'));
  });
});

describe('Workforce permission guards — source contract', () => {
  test('guards bridge super_admin to legacy owner grants', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src/workforce/permissions/guards.ts'),
      'utf8',
    );
    assert.match(src, /session\.admin\.role === 'super_admin'/);
    assert.match(src, /mapLegacyHairPermissions\('super_admin'/);
    assert.match(src, /hasWorkforcePermission\(legacyGrants, key\)/);
  });
});
