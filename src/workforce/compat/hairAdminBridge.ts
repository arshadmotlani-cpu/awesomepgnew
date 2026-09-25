import type { HairPermission } from '@/src/hair/lib/auth/permissionTypes';
import type { HairAdmin } from '@/src/hair/lib/auth/session';
import type { WfEmployee } from '@/src/workforce/db/schema';
import type { WorkforcePermissionGrants } from '@/src/workforce/types';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';
import { permissionSatisfied } from '@/src/workforce/permissions/aliases';

/** Map Workforce grants → legacy HairPermission keys for existing FYH guards/nav. */
export function workforceGrantsToHairPermissions(
  grants: WorkforcePermissionGrants,
): HairPermission[] {
  const out = new Set<HairPermission>();
  const has = (key: string) => permissionSatisfied(grants.permissions, key);

  const dashboardAny =
    has('dashboard.full') ||
    has('dashboard.view') ||
    has('dashboard.view_expenses') ||
    has('dashboard.view_appointments') ||
    has('dashboard.revenue.personal') ||
    has('dashboard.revenue.salon') ||
    has('dashboard.view_revenue') ||
    has('dashboard.view_staff') ||
    has('dashboard.view_customers');

  if (dashboardAny) out.add('page:dashboard');

  if (
    has('dashboard.full') ||
    has('dashboard.revenue.salon') ||
    has('dashboard.revenue.personal') ||
    has('dashboard.view_revenue')
  ) {
    out.add('page:dashboard_revenue');
  }

  if (
    has('dashboard.full') ||
    has('dashboard.revenue.salon') ||
    has('dashboard.revenue.personal') ||
    has('dashboard.view_staff') ||
    has('performance.all.view')
  ) {
    out.add('page:dashboard_staff');
  }

  if (has('customers.view') || has('customers.customer.view')) {
    out.add('page:customers');
  }

  if (
    has('appointments.view_all') ||
    has('appointments.view_own') ||
    has('appointments.add') ||
    has('appointments.edit')
  ) {
    out.add('page:appointments');
  }

  if (
    has('billing.invoices.view') ||
    has('billing.bill.create') ||
    has('billing.bill.edit') ||
    has('billing.view')
  ) {
    out.add('page:billing');
  }

  if (has('billing.bill.create') || has('billing.create_invoice') || has('quick_sale.access')) {
    out.add('page:quick_sale');
    out.add('action:billing.checkout');
  }

  if (has('configuration.view') || has('settings.view')) {
    out.add('page:services');
    out.add('page:packages');
    out.add('page:memberships');
  }

  if (has('configuration.view') || has('configuration.edit') || has('settings.view')) {
    out.add('page:settings');
  }

  if (has('configuration.edit') || has('settings.manage')) {
    out.add('action:settings.edit');
    out.add('action:packages.edit');
  }

  if (has('expenses.general.view') || has('expenses.salary.view')) {
    out.add('page:expenses');
  }

  if (has('reports.view') || has('analytics.view')) {
    out.add('page:reports');
  }
  if (has('reports.export')) {
    out.add('action:reports.export');
  }

  if (has('staff.view') || has('staff.edit')) {
    out.add('page:staff');
  }

  if (
    has('inventory.view') ||
    has('inventory.edit') ||
    has('inventory.product.view') ||
    has('products.view') ||
    has('products.edit')
  ) {
    out.add('page:inventory');
    out.add('page:purchases');
    if (has('inventory.edit') || has('products.edit')) out.add('action:inventory.adjust');
  }

  if (has('permissions.manage') || has('system.settings')) {
    out.add('page:settings');
    out.add('action:settings.edit');
  }

  return [...out];
}

export function employeeToHairAdmin(
  employee: WfEmployee,
  grants: WorkforcePermissionGrants,
): HairAdmin {
  const elevated =
    hasWorkforcePermission(grants, 'permissions.manage') ||
    hasWorkforcePermission(grants, 'system.settings');
  return {
    id: employee.legacyAdminUserId ?? employee.id,
    organizationId: employee.organizationId ?? null,
    userId: employee.userId ?? null,
    email: employee.email ?? employee.mobile ?? `${employee.id}@workforce.local`,
    passwordHash: employee.passwordHash ?? '',
    displayName: employee.fullName,
    role: elevated ? 'super_admin' : 'admin',
    permissions: workforceGrantsToHairPermissions(grants),
    lastLoginAt: null,
    createdAt: employee.createdAt,
  };
}

export function canManagePermissions(grants: WorkforcePermissionGrants): boolean {
  return (
    hasWorkforcePermission(grants, 'permissions.manage') ||
    hasWorkforcePermission(grants, 'system.settings') ||
    hasWorkforcePermission(grants, 'staff.edit')
  );
}
