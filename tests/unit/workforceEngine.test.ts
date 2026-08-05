/**
 * Workforce Engine unit tests — permissions, mobile normalize, bridge mapping.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { normalizeMobile } from '@/src/workforce/auth/mobile';
import {
  defaultGrantsFor,
  hasWorkforcePermission,
  mapLegacyHairPermissions,
} from '@/src/workforce/permissions/presets';
import { workforceGrantsToHairPermissions } from '@/src/workforce/compat/hairAdminBridge';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import { workforceJobRoleLabel, workforceRankLabel } from '@/src/workforce/labels';

describe('Workforce permissions', () => {
  test('owner gets all permissions and unlimited backdate', () => {
    const g = defaultGrantsFor('owner', 'owner');
    assert.equal(g.maxBackdateDays, null);
    assert.ok(hasWorkforcePermission(g, 'settings.manage'));
    assert.ok(hasWorkforcePermission(g, 'finance.view_profit'));
  });

  test('manager cannot manage owner settings by default', () => {
    const g = defaultGrantsFor('manager', 'manager');
    assert.equal(g.maxBackdateDays, 7);
    assert.equal(hasWorkforcePermission(g, 'settings.manage'), false);
    assert.ok(hasWorkforcePermission(g, 'appointments.receive_bookings'));
  });

  test('stylist receives bookings; cleaner does not', () => {
    const stylist = defaultGrantsFor('team_member', 'stylist');
    const cleaner = defaultGrantsFor('team_member', 'cleaner');
    assert.ok(hasWorkforcePermission(stylist, 'appointments.receive_bookings'));
    assert.equal(hasWorkforcePermission(cleaner, 'appointments.receive_bookings'), false);
  });

  test('legacy super_admin maps to owner grants', () => {
    const g = mapLegacyHairPermissions('super_admin', []);
    assert.equal(g.maxBackdateDays, null);
    assert.ok(g.permissions.includes('settings.manage'));
  });

  test('workforce grants bridge to hair page permissions', () => {
    const hair = workforceGrantsToHairPermissions(
      defaultGrantsFor('manager', 'manager'),
    );
    assert.ok(hair.includes('page:appointments'));
    assert.ok(hair.includes('page:dashboard'));
  });
});

describe('Workforce mobile normalize', () => {
  test('10-digit Indian mobile becomes +91', () => {
    assert.equal(normalizeMobile('9876543210'), '+919876543210');
    assert.equal(normalizeMobile('+91 98765 43210'), '+919876543210');
  });

  test('invalid short numbers rejected', () => {
    assert.equal(normalizeMobile('123'), null);
  });
});

describe('Workforce feature flag', () => {
  test('isWorkforceEngineEnabled reads env', () => {
    const prev = process.env.WORKFORCE_ENGINE;
    process.env.WORKFORCE_ENGINE = '1';
    assert.equal(isWorkforceEngineEnabled(), true);
    process.env.WORKFORCE_ENGINE = '0';
    assert.equal(isWorkforceEngineEnabled(), false);
    if (prev === undefined) delete process.env.WORKFORCE_ENGINE;
    else process.env.WORKFORCE_ENGINE = prev;
  });
});

describe('Workforce labels', () => {
  test('ranks display as Owner / Manager / Staff', () => {
    assert.equal(workforceRankLabel('owner'), 'Owner');
    assert.equal(workforceRankLabel('manager'), 'Manager');
    assert.equal(workforceRankLabel('team_member'), 'Staff');
  });

  test('designation labels cover job roles', () => {
    assert.equal(workforceJobRoleLabel('stylist'), 'Stylist');
    assert.equal(workforceJobRoleLabel('receptionist'), 'Receptionist');
  });
});

describe('Workforce Add Employee popup', () => {
  test('popup source includes Phase 2 field names', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src/workforce/components/AddEmployeePopup.tsx'),
      'utf8',
    );
    for (const name of [
      'fullName',
      'mobile',
      'password',
      'gender',
      'emergencyContact',
      'joiningDate',
      'salaryInr',
      'aadhaarNumber',
      'panNumber',
      'upiId',
      'qrCodeUrl',
      'jobRole',
    ]) {
      assert.match(src, new RegExp(`name="${name}"`));
    }
    assert.match(src, /Full Name/);
    assert.match(src, /Phone Number/);
    assert.match(src, /Designation/);
    assert.match(src, /role="dialog"/);
  });
});

describe('Workforce role home paths', () => {
  test('owner and manager land on workforce home; staff on /me', async () => {
    const { workforceHomePathForRank } = await import('@/src/workforce/dashboards/roleHome');
    assert.equal(workforceHomePathForRank('owner'), '/workforce/home');
    assert.equal(workforceHomePathForRank('manager'), '/workforce/home');
    assert.equal(workforceHomePathForRank('team_member'), '/me');
  });
});
