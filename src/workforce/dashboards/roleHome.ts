import type { WorkforcePermissionGrants } from '@/src/workforce/types';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';

export type RoleNavLink = {
  href: string;
  label: string;
  /** Permission key required. Omit = always show when shell is visible. */
  permission?: string;
};

export const WORKFORCE_HUB_NAV: RoleNavLink[] = [
  { href: '/dashboard/revenue', label: 'Revenue', permission: 'dashboard.view_revenue' },
  { href: '/appointments', label: 'Appointments', permission: 'appointments.view_all' },
  { href: '/customers', label: 'Customers', permission: 'customers.view' },
  { href: '/billing/invoices', label: 'Billing', permission: 'billing.view' },
  { href: '/workforce', label: 'Workforce', permission: 'staff.view' },
  { href: '/workforce/operations', label: 'Ops · hours & pay', permission: 'finance.view_salary' },
  { href: '/reports', label: 'Reports', permission: 'reports.view' },
  { href: '/inventory', label: 'Inventory', permission: 'inventory.view' },
  { href: '/settings', label: 'Settings', permission: 'settings.view' },
  { href: '/me', label: 'My workspace', permission: 'appointments.view_own' },
];

/** Post-login hub path — permission-based only (never role names). */
export function workforceHomePathForGrants(grants: WorkforcePermissionGrants | null): string {
  if (!grants) return '/me';
  if (hasWorkforcePermission(grants, 'staff.view')) return '/workforce/home';
  if (
    hasWorkforcePermission(grants, 'appointments.view_own') &&
    !hasWorkforcePermission(grants, 'appointments.view_all')
  ) {
    return '/me';
  }
  if (hasWorkforcePermission(grants, 'appointments.view_all')) return '/appointments';
  if (hasWorkforcePermission(grants, 'dashboard.view')) return '/dashboard/revenue';
  return '/me';
}

/** @deprecated Use workforceHomePathForGrants */
export function workforceHomePathForRank(): string {
  return '/me';
}
