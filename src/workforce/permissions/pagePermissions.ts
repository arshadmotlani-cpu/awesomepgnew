/**
 * Route → v2 permission mapping for layout guards.
 * Replaces legacy page:* checks when workforce session is available.
 */

import type { HairPagePermission } from '@/src/hair/lib/auth/permissionTypes';
import { pagePermissionForPath as legacyPagePermissionForPath } from '@/src/hair/lib/auth/permissionTypes';
import { permissionSatisfied } from '@/src/workforce/permissions/aliases';
import type { WorkforcePermissionGrants } from '@/src/workforce/types';

/** v2 permission required for route access (first match wins). */
const ROUTE_PERMISSION_RULES: Array<[prefix: string, permission: string]> = [
  ['/dashboard/revenue', 'dashboard.view_revenue'],
  ['/dashboard/staff-performance', 'performance.all.view'],
  ['/dashboard', 'dashboard.view'],
  ['/customers', 'customers.customer.view'],
  ['/appointments', 'appointments.appointment.view'],
  ['/billing', 'billing.invoice.view'],
  ['/quick-sale', 'quick_sale.access'],
  ['/advance-payment', 'billing.payment.record'],
  ['/inventory', 'inventory.product.view'],
  ['/vendors', 'inventory.product.view'],
  ['/purchases', 'inventory.purchase.create'],
  ['/expenses', 'expenses.expense.view'],
  ['/reports', 'reports.revenue.view'],
  ['/settings', 'settings.view'],
  ['/staff', 'staff.profile.view'],
  ['/team', 'staff.profile.view'],
  ['/services', 'services.view'],
  ['/products', 'inventory.product.view'],
  ['/packages', 'packages.package.view'],
  ['/memberships', 'memberships.view'],
  ['/loyalty', 'customers.customer.view'],
  ['/workforce', 'dashboard.view'],
  ['/me', 'appointments.appointment.manage_own'],
  ['/attendance', 'attendance.own.view'],
];

export function normalizeFyhPath(pathname: string): string {
  let path = pathname.split('?')[0] ?? pathname;
  if (path.startsWith('/fyh')) {
    path = path.slice(4) || '/';
  }
  return path;
}

export function v2PermissionForPath(pathname: string): string | null {
  const path = normalizeFyhPath(pathname);
  const exemptPrefixes = ['/profile', '/access-denied'];
  for (const prefix of exemptPrefixes) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return null;
  }
  for (const [prefix, permission] of ROUTE_PERMISSION_RULES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return permission;
  }
  return null;
}

/** Check route access using workforce grants (with v1/v2 alias resolution). */
export function grantsAllowPath(grants: WorkforcePermissionGrants, pathname: string): boolean {
  const v2 = v2PermissionForPath(pathname);
  if (!v2) return true;
  return permissionSatisfied(grants.permissions, v2);
}

/** Bridge: legacy page key for nav components still using HairPermission. */
export function legacyPageKeyForPath(pathname: string): HairPagePermission | null {
  return legacyPagePermissionForPath(pathname);
}
