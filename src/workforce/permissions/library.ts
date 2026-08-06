/**
 * Workforce Permission Library — canonical catalog of ERP permissions.
 * Access Roles (job titles) load default templates from these keys; grants may override.
 */

export type WorkforcePermissionGroup =
  | 'dashboard'
  | 'customers'
  | 'appointments'
  | 'billing'
  | 'products'
  | 'services'
  | 'packages'
  | 'memberships'
  | 'inventory'
  | 'staff'
  | 'reports'
  | 'loyalty'
  | 'settings'
  | 'configuration'
  | 'calendar'
  | 'cash_drawer'
  | 'expenses'
  | 'analytics'
  | 'records'
  | 'approvals'
  | 'permissions'
  | 'ecosystem';

export type WorkforcePermissionDef = {
  key: string;
  label: string;
  group: WorkforcePermissionGroup;
  description: string;
};

/** Every toggleable permission in the Workforce ERP. */
export const WORKFORCE_PERMISSION_LIBRARY: readonly WorkforcePermissionDef[] = [
  // Dashboard
  { key: 'dashboard.view', label: 'Dashboard', group: 'dashboard', description: 'Access business dashboards' },
  { key: 'dashboard.view_revenue', label: 'Revenue', group: 'dashboard', description: 'Revenue dashboards and KPIs' },
  { key: 'dashboard.view_expenses', label: 'Expenses', group: 'dashboard', description: 'Expense summaries on dashboard' },
  { key: 'dashboard.view_staff', label: 'Staff metrics', group: 'dashboard', description: 'Staff performance on dashboard' },
  { key: 'dashboard.view_customers', label: 'Customer metrics', group: 'dashboard', description: 'Customer insights on dashboard' },
  // Customers
  { key: 'customers.view', label: 'Customers', group: 'customers', description: 'View customer profiles and CRM' },
  { key: 'customers.edit', label: 'Edit customers', group: 'customers', description: 'Create and update customer records' },
  // Appointments
  { key: 'appointments.view_own', label: 'Own appointments', group: 'appointments', description: 'View own calendar and bookings' },
  { key: 'appointments.view_all', label: 'All appointments', group: 'appointments', description: 'View entire salon calendar' },
  { key: 'appointments.edit', label: 'Manage appointments', group: 'appointments', description: 'Create, reschedule, cancel appointments' },
  { key: 'appointments.receive_bookings', label: 'Receive bookings', group: 'appointments', description: 'Appear as bookable staff on calendar' },
  // Billing
  { key: 'billing.view', label: 'Billing', group: 'billing', description: 'View invoices and payments' },
  { key: 'billing.create_invoice', label: 'Create invoices', group: 'billing', description: 'Checkout and create invoices' },
  { key: 'billing.edit_invoice', label: 'Edit invoices', group: 'billing', description: 'Modify existing invoices' },
  { key: 'billing.backdate_invoice', label: 'Backdate invoices', group: 'billing', description: 'Post invoices with past dates' },
  // Products / Services / Packages / Memberships
  { key: 'products.view', label: 'Products', group: 'products', description: 'View retail product catalog' },
  { key: 'products.edit', label: 'Edit products', group: 'products', description: 'Manage product catalog' },
  { key: 'services.view', label: 'Services', group: 'services', description: 'View service menu' },
  { key: 'services.edit', label: 'Edit services', group: 'services', description: 'Manage services and pricing' },
  { key: 'packages.view', label: 'Packages', group: 'packages', description: 'View service packages' },
  { key: 'packages.edit', label: 'Edit packages', group: 'packages', description: 'Manage packages' },
  { key: 'memberships.view', label: 'Memberships', group: 'memberships', description: 'View membership plans' },
  { key: 'memberships.edit', label: 'Edit memberships', group: 'memberships', description: 'Manage membership plans' },
  // Inventory
  { key: 'inventory.view', label: 'Inventory', group: 'inventory', description: 'View stock levels' },
  { key: 'inventory.edit', label: 'Edit inventory', group: 'inventory', description: 'Adjust stock and costs' },
  // Staff
  { key: 'staff.view', label: 'Staff', group: 'staff', description: 'View team roster and profiles' },
  { key: 'staff.edit', label: 'Edit staff', group: 'staff', description: 'Update employee profiles' },
  { key: 'staff.add', label: 'Add staff', group: 'staff', description: 'Hire new employees' },
  // Reports / Analytics
  { key: 'reports.view', label: 'Reports', group: 'reports', description: 'View analytics reports' },
  { key: 'reports.export', label: 'Export', group: 'reports', description: 'Download report exports' },
  { key: 'analytics.view', label: 'Analytics', group: 'analytics', description: 'Advanced analytics views' },
  // Loyalty
  { key: 'loyalty.view', label: 'Loyalty', group: 'loyalty', description: 'View loyalty programs' },
  { key: 'loyalty.edit', label: 'Edit loyalty', group: 'loyalty', description: 'Manage loyalty rules' },
  // Settings / Configuration
  { key: 'settings.view', label: 'Settings', group: 'settings', description: 'View salon settings' },
  { key: 'settings.manage', label: 'Manage settings', group: 'settings', description: 'Save salon configuration' },
  { key: 'configuration.view', label: 'Configuration', group: 'configuration', description: 'View catalog configuration' },
  { key: 'configuration.edit', label: 'Edit configuration', group: 'configuration', description: 'Manage catalog configuration' },
  // Calendar / Cash / Expenses
  { key: 'calendar.view', label: 'Calendar', group: 'calendar', description: 'View shared calendars' },
  { key: 'calendar.edit', label: 'Edit calendar', group: 'calendar', description: 'Manage calendar settings' },
  { key: 'cash_drawer.view', label: 'Cash drawer', group: 'cash_drawer', description: 'View cash drawer' },
  { key: 'cash_drawer.manage', label: 'Manage cash drawer', group: 'cash_drawer', description: 'Open/close cash drawer sessions' },
  { key: 'expenses.view', label: 'Expenses', group: 'expenses', description: 'View expense records' },
  { key: 'expenses.edit', label: 'Edit expenses', group: 'expenses', description: 'Record and edit expenses' },
  // Finance (legacy keys retained)
  { key: 'finance.view_salary', label: 'View salaries', group: 'staff', description: 'View payroll and salary data' },
  { key: 'finance.view_profit', label: 'View profit', group: 'analytics', description: 'View profit margins' },
  { key: 'finance.view_expenses', label: 'Finance expenses', group: 'expenses', description: 'View financial expense reports' },
  // Records / Approvals
  { key: 'records.delete', label: 'Delete records', group: 'records', description: 'Delete sensitive business records' },
  { key: 'billing.approve_refund', label: 'Approve refunds', group: 'approvals', description: 'Approve customer refunds' },
  { key: 'billing.approve_discount', label: 'Approve discounts', group: 'approvals', description: 'Approve large discounts' },
  // Permissions / System
  { key: 'permissions.manage', label: 'Manage permissions', group: 'permissions', description: 'Edit role templates and employee permissions' },
  { key: 'system.settings', label: 'System settings', group: 'settings', description: 'System-level configuration' },
  // Ecosystem engines (future)
  { key: 'ecosystem.owner_os', label: 'Owner OS', group: 'ecosystem', description: 'Owner dashboard across businesses' },
  { key: 'ecosystem.capital', label: 'Capital', group: 'ecosystem', description: 'Capital engine access' },
  { key: 'ecosystem.pg', label: 'PG', group: 'ecosystem', description: 'Awesome PG engine access' },
] as const;

export const WORKFORCE_PERMISSION_KEYS = WORKFORCE_PERMISSION_LIBRARY.map((p) => p.key);

export type WorkforcePermissionKey = (typeof WORKFORCE_PERMISSION_KEYS)[number];

const KEY_SET = new Set<string>(WORKFORCE_PERMISSION_KEYS);

export function isWorkforcePermissionKey(value: string): value is WorkforcePermissionKey {
  return KEY_SET.has(value);
}

export function permissionDef(key: string): WorkforcePermissionDef | undefined {
  return WORKFORCE_PERMISSION_LIBRARY.find((p) => p.key === key);
}

export function permissionsByGroup(): Record<WorkforcePermissionGroup, WorkforcePermissionDef[]> {
  const out = {} as Record<WorkforcePermissionGroup, WorkforcePermissionDef[]>;
  for (const def of WORKFORCE_PERMISSION_LIBRARY) {
    (out[def.group] ??= []).push(def);
  }
  return out;
}

export const WORKFORCE_PERMISSION_GROUP_LABELS: Record<WorkforcePermissionGroup, string> = {
  dashboard: 'Dashboard',
  customers: 'Customers',
  appointments: 'Appointments',
  billing: 'Billing',
  products: 'Products',
  services: 'Services',
  packages: 'Packages',
  memberships: 'Memberships',
  inventory: 'Inventory',
  staff: 'Staff',
  reports: 'Reports',
  loyalty: 'Loyalty',
  settings: 'Settings',
  configuration: 'Configuration',
  calendar: 'Calendar',
  cash_drawer: 'Cash Drawer',
  expenses: 'Expenses',
  analytics: 'Analytics',
  records: 'Records',
  approvals: 'Approvals',
  permissions: 'Permissions',
  ecosystem: 'Ecosystem',
};
