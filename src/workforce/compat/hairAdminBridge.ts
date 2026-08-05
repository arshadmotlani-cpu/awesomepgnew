import type { HairPermission } from '@/src/hair/lib/auth/permissionTypes';
import type { HairAdmin } from '@/src/hair/lib/auth/session';
import type { WfEmployee } from '@/src/workforce/db/schema';
import type { WorkforcePermissionGrants, WorkforceRank } from '@/src/workforce/types';

/** Map Workforce grants → legacy HairPermission keys for existing FYH guards/nav. */
export function workforceGrantsToHairPermissions(
  grants: WorkforcePermissionGrants,
): HairPermission[] {
  const out = new Set<HairPermission>();
  const p = new Set(grants.permissions);
  if (
    p.has('dashboard.view_revenue') ||
    p.has('dashboard.view_expenses') ||
    p.has('dashboard.view_staff')
  ) {
    out.add('page:dashboard');
  }
  if (p.has('dashboard.view_customers')) out.add('page:customers');
  if (
    p.has('appointments.view_all') ||
    p.has('appointments.view_own') ||
    p.has('appointments.edit') ||
    p.has('appointments.receive_bookings')
  ) {
    out.add('page:appointments');
  }
  if (p.has('billing.create_invoice') || p.has('billing.edit_invoice')) {
    out.add('page:billing');
    out.add('page:quick_sale');
    out.add('action:billing.checkout');
  }
  if (p.has('inventory.view') || p.has('inventory.edit')) {
    out.add('page:inventory');
    if (p.has('inventory.edit')) out.add('action:inventory.adjust');
  }
  if (p.has('reports.view')) out.add('page:reports');
  if (p.has('reports.export')) out.add('action:reports.export');
  if (p.has('settings.manage')) {
    out.add('page:settings');
    out.add('action:settings.edit');
  }
  return [...out];
}

export function employeeToHairAdmin(
  employee: WfEmployee,
  rank: WorkforceRank,
  grants: WorkforcePermissionGrants,
): HairAdmin {
  return {
    id: employee.legacyAdminUserId ?? employee.id,
    email: employee.email ?? employee.mobile ?? `${employee.id}@workforce.local`,
    passwordHash: employee.passwordHash ?? '',
    displayName: employee.fullName,
    role: rank === 'owner' ? 'super_admin' : 'admin',
    permissions: workforceGrantsToHairPermissions(grants),
    lastLoginAt: null,
    createdAt: employee.createdAt,
  };
}
