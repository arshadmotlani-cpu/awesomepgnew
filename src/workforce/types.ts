/**
 * Workforce Engine — domain constants (no salon naming).
 */

export const WORKFORCE_ENGINES = [
  'fyh_salon',
  'awesome_pg',
  'automotive_capital',
  'personal_finance',
] as const;
export type WorkforceEngineId = (typeof WORKFORCE_ENGINES)[number];

export const WORKFORCE_RANKS = ['owner', 'manager', 'team_member'] as const;
export type WorkforceRank = (typeof WORKFORCE_RANKS)[number];

export const WORKFORCE_JOB_ROLES = [
  'owner',
  'manager',
  'receptionist',
  'stylist',
  'housekeeping',
  'security',
  'driver',
  'cleaner',
  'accountant',
] as const;
export type WorkforceJobRole = (typeof WORKFORCE_JOB_ROLES)[number];

export const WORKFORCE_EMPLOYEE_STATUSES = ['active', 'inactive'] as const;
export type WorkforceEmployeeStatus = (typeof WORKFORCE_EMPLOYEE_STATUSES)[number];

export const WORKFORCE_GENDERS = ['male', 'female', 'other', 'unspecified'] as const;
export type WorkforceGender = (typeof WORKFORCE_GENDERS)[number];

/** Grouped permission keys — replace legacy per-page checkbox sprawl. */
export const WORKFORCE_PERMISSION_KEYS = [
  // Dashboard
  'dashboard.view_revenue',
  'dashboard.view_expenses',
  'dashboard.view_staff',
  'dashboard.view_customers',
  // Appointments
  'appointments.receive_bookings',
  'appointments.view_own',
  'appointments.view_all',
  'appointments.edit',
  // Billing
  'billing.create_invoice',
  'billing.edit_invoice',
  'billing.backdate_invoice',
  // Inventory
  'inventory.view',
  'inventory.edit',
  // Finance
  'finance.view_salary',
  'finance.view_profit',
  'finance.view_expenses',
  // Reports
  'reports.view',
  'reports.export',
  // Staff / Workforce
  'staff.view',
  'staff.edit',
  'staff.add',
  // Settings
  'settings.manage',
] as const;
export type WorkforcePermissionKey = (typeof WORKFORCE_PERMISSION_KEYS)[number];

export type WorkforcePermissionGrants = {
  permissions: WorkforcePermissionKey[];
  /** null = unlimited (Owner) */
  maxBackdateDays: number | null;
};

export const RANK_ORDER: Record<WorkforceRank, number> = {
  owner: 100,
  manager: 50,
  team_member: 10,
};

/**
 * Workforce is ON by default so FYH surfaces the permanent employee system.
 * Opt out explicitly: WORKFORCE_ENGINE=0 | false | off
 */
export function isWorkforceEngineEnabled(): boolean {
  const raw = process.env.WORKFORCE_ENGINE;
  if (raw === undefined || raw.trim() === '') return true;
  const v = raw.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return v === '1' || v === 'true' || v === 'on';
}
