import type { WorkforceRank } from '@/src/workforce/types';

/** Post-login / hub path by Workforce rank. */
export function workforceHomePathForRank(rank: WorkforceRank): string {
  switch (rank) {
    case 'owner':
      return '/workforce/home';
    case 'manager':
      return '/workforce/home';
    case 'team_member':
      return '/me';
    default:
      return '/me';
  }
}

export type RoleNavLink = {
  href: string;
  label: string;
  /** Permission key required (Workforce). Omit = always show for this rank shell. */
  permission?: string;
};

export const OWNER_NAV: RoleNavLink[] = [
  { href: '/dashboard/revenue', label: 'Revenue', permission: 'dashboard.view_revenue' },
  { href: '/appointments', label: 'Appointments', permission: 'appointments.view_all' },
  { href: '/customers', label: 'Customers', permission: 'dashboard.view_customers' },
  { href: '/billing/invoices', label: 'Billing', permission: 'billing.create_invoice' },
  { href: '/workforce', label: 'Workforce', permission: 'staff.view' },
  { href: '/workforce/operations', label: 'Ops · hours & pay', permission: 'staff.view' },
  { href: '/reports', label: 'Reports', permission: 'reports.view' },
  { href: '/inventory', label: 'Inventory', permission: 'inventory.view' },
  { href: '/settings', label: 'Settings', permission: 'settings.manage' },
];

export const MANAGER_NAV: RoleNavLink[] = [
  { href: '/dashboard/revenue', label: 'Revenue', permission: 'dashboard.view_revenue' },
  { href: '/appointments', label: 'Appointments', permission: 'appointments.view_all' },
  { href: '/customers', label: 'Customers', permission: 'dashboard.view_customers' },
  { href: '/billing/invoices', label: 'Billing', permission: 'billing.create_invoice' },
  { href: '/workforce', label: 'Team', permission: 'staff.view' },
  { href: '/workforce/operations', label: 'Ops · hours & pay', permission: 'staff.view' },
  { href: '/reports', label: 'Reports', permission: 'reports.view' },
  { href: '/inventory', label: 'Inventory', permission: 'inventory.view' },
];

export const STAFF_NAV: RoleNavLink[] = [
  { href: '/me', label: 'My workspace' },
  { href: '/appointments', label: 'My appointments', permission: 'appointments.view_own' },
];
