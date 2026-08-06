import { normalizeAccessRole } from '@/src/workforce/accessRoles';
import type { WorkforceJobRole } from '@/src/workforce/types';
import {
  WORKFORCE_PERMISSION_KEYS,
  type WorkforcePermissionKey,
} from '@/src/workforce/permissions/library';

export type WorkforcePermissionGrants = {
  permissions: WorkforcePermissionKey[];
  /** null = unlimited (Owner) */
  maxBackdateDays: number | null;
};

const ALL = [...WORKFORCE_PERMISSION_KEYS] as WorkforcePermissionKey[];

const OWNER_TEMPLATE: WorkforcePermissionKey[] = [...ALL];

const MANAGER_TEMPLATE: WorkforcePermissionKey[] = [
  'dashboard.view',
  'dashboard.view_revenue',
  'dashboard.view_expenses',
  'dashboard.view_staff',
  'dashboard.view_customers',
  'customers.view',
  'customers.edit',
  'appointments.receive_bookings',
  'appointments.view_own',
  'appointments.view_all',
  'appointments.edit',
  'billing.view',
  'billing.create_invoice',
  'billing.edit_invoice',
  'billing.backdate_invoice',
  'billing.approve_discount',
  'products.view',
  'services.view',
  'packages.view',
  'memberships.view',
  'inventory.view',
  'inventory.edit',
  'staff.view',
  'staff.edit',
  'staff.add',
  'reports.view',
  'reports.export',
  'analytics.view',
  'loyalty.view',
  'configuration.view',
  'calendar.view',
  'expenses.view',
  'finance.view_expenses',
];

const RECEPTIONIST_TEMPLATE: WorkforcePermissionKey[] = [
  'dashboard.view_customers',
  'customers.view',
  'customers.edit',
  'appointments.receive_bookings',
  'appointments.view_own',
  'appointments.view_all',
  'appointments.edit',
  'billing.view',
  'billing.create_invoice',
  'billing.edit_invoice',
  'billing.backdate_invoice',
  'calendar.view',
  'loyalty.view',
];

const SERVICE_PROVIDER_TEMPLATE: WorkforcePermissionKey[] = [
  'dashboard.view_customers',
  'customers.view',
  'appointments.receive_bookings',
  'appointments.view_own',
  'calendar.view',
];

const ACCOUNTANT_TEMPLATE: WorkforcePermissionKey[] = [
  'billing.view',
  'billing.create_invoice',
  'billing.edit_invoice',
  'billing.backdate_invoice',
  'billing.approve_refund',
  'reports.view',
  'reports.export',
  'analytics.view',
  'expenses.view',
  'expenses.edit',
  'finance.view_expenses',
  'finance.view_profit',
];

const INVENTORY_MANAGER_TEMPLATE: WorkforcePermissionKey[] = [
  'inventory.view',
  'inventory.edit',
  'products.view',
  'products.edit',
];

const CLEANER_TEMPLATE: WorkforcePermissionKey[] = [];

const INTERN_TEMPLATE: WorkforcePermissionKey[] = ['appointments.view_own', 'calendar.view'];

/** Code-default permission templates per Access Role (job title). */
export const CODE_ROLE_TEMPLATES: Record<
  WorkforceJobRole,
  { permissions: WorkforcePermissionKey[]; maxBackdateDays: number | null }
> = {
  owner: { permissions: OWNER_TEMPLATE, maxBackdateDays: null },
  manager: { permissions: MANAGER_TEMPLATE, maxBackdateDays: 7 },
  receptionist: { permissions: RECEPTIONIST_TEMPLATE, maxBackdateDays: 2 },
  stylist: { permissions: SERVICE_PROVIDER_TEMPLATE, maxBackdateDays: 0 },
  barber: { permissions: SERVICE_PROVIDER_TEMPLATE, maxBackdateDays: 0 },
  beautician: { permissions: SERVICE_PROVIDER_TEMPLATE, maxBackdateDays: 0 },
  makeup_artist: { permissions: SERVICE_PROVIDER_TEMPLATE, maxBackdateDays: 0 },
  nail_technician: { permissions: SERVICE_PROVIDER_TEMPLATE, maxBackdateDays: 0 },
  hair_assistant: { permissions: SERVICE_PROVIDER_TEMPLATE, maxBackdateDays: 0 },
  cleaner: { permissions: CLEANER_TEMPLATE, maxBackdateDays: 0 },
  accountant: { permissions: ACCOUNTANT_TEMPLATE, maxBackdateDays: 7 },
  inventory_manager: { permissions: INVENTORY_MANAGER_TEMPLATE, maxBackdateDays: 0 },
  intern: { permissions: INTERN_TEMPLATE, maxBackdateDays: 0 },
  housekeeping: { permissions: CLEANER_TEMPLATE, maxBackdateDays: 0 },
  security: { permissions: CLEANER_TEMPLATE, maxBackdateDays: 0 },
  driver: { permissions: INTERN_TEMPLATE, maxBackdateDays: 0 },
};

export function codeTemplateForAccessRole(accessRole: WorkforceJobRole): WorkforcePermissionGrants {
  const role = normalizeAccessRole(accessRole);
  const tpl = CODE_ROLE_TEMPLATES[role] ?? CODE_ROLE_TEMPLATES.stylist;
  return {
    permissions: [...tpl.permissions],
    maxBackdateDays: tpl.maxBackdateDays,
  };
}
