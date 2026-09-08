import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HAIR_NAV_ENTRIES,
  resolveAttendanceNavHref,
  resolveNavEntries,
} from '@/src/hair/lib/nav';
import type { PermissionAdmin } from '@/src/hair/lib/auth/permissionTypes';

function admin(role: PermissionAdmin['role'], permissions?: PermissionAdmin['permissions']): PermissionAdmin {
  return { role, permissions: permissions ?? null };
}

describe('Attendance sidebar navigation', () => {
  it('maps owner/admin dashboard roles to team attendance manage route', () => {
    assert.equal(resolveAttendanceNavHref(admin('super_admin')), '/attendance/manage');
    assert.equal(
      resolveAttendanceNavHref(admin('admin', ['page:dashboard', 'page:appointments'])),
      '/attendance/manage',
    );
  });

  it('maps staff-style roles to self-service attendance route', () => {
    assert.equal(
      resolveAttendanceNavHref(admin('admin', ['page:appointments'])),
      '/attendance',
    );
  });

  it('rewrites the Attendance sidebar href after permission filtering', () => {
    const ownerNav = resolveNavEntries(admin('super_admin'));
    const attendance = ownerNav.find(
      (entry) => entry.type === 'link' && entry.label === 'Attendance',
    );
    assert.ok(attendance && attendance.type === 'link');
    assert.equal(attendance.href, '/attendance/manage');

    const staffNav = resolveNavEntries(admin('admin', ['page:appointments']));
    const staffAttendance = staffNav.find(
      (entry) => entry.type === 'link' && entry.label === 'Attendance',
    );
    assert.ok(staffAttendance && staffAttendance.type === 'link');
    assert.equal(staffAttendance.href, '/attendance');
  });

  it('keeps Revenue Dashboard href unchanged', () => {
    const dashboard = HAIR_NAV_ENTRIES.find((entry) => entry.type === 'group' && entry.id === 'dashboard');
    assert.ok(dashboard && dashboard.type === 'group');
    assert.equal(dashboard.children[0]?.href, '/dashboard/revenue');
  });
});
