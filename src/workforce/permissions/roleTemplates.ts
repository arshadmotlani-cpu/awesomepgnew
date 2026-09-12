import { normalizeAccessRole } from '@/src/workforce/accessRoles';
import type { WorkforceJobRole } from '@/src/workforce/types';
import {
  WORKFORCE_PERMISSION_KEYS,
  WORKFORCE_PERMISSION_LIBRARY_FULL,
  type WorkforcePermissionKey,
} from '@/src/workforce/permissions/library';

const OWNER_ONLY_KEYS = new Set(
  WORKFORCE_PERMISSION_LIBRARY_FULL.filter((d) => d.ownerOnly).map((d) => d.key),
);

import type { WorkforcePermissionGrants as Grants } from '@/src/workforce/types';

export type WorkforcePermissionGrants = Grants;

const ALL = [...WORKFORCE_PERMISSION_KEYS] as WorkforcePermissionKey[];

const OWNER_TEMPLATE: WorkforcePermissionKey[] = [...ALL];

/** Owner-only by default — grant explicitly via Additional Rights. */
const MANAGER_EXCLUDED: WorkforcePermissionKey[] = [
  'permissions.manage',
  'system.settings',
  'settings.manage',
  'configuration.edit',
  'attendance.manage_office',
  'attendance.view_team',
  'attendance.correct',
  'finance.view_salary',
  'finance.manage_salary',
  'finance.pay_salary',
  'finance.view_salary_qr',
  'finance.view_own_salary',
  'staff.view_financials',
  'payroll.view_reports',
];

const MANAGER_TEMPLATE: WorkforcePermissionKey[] = ALL.filter(
  (k) => !MANAGER_EXCLUDED.includes(k) && !OWNER_ONLY_KEYS.has(k),
);

const BILLER_TEMPLATE: WorkforcePermissionKey[] = [
  'customers.view',
  'customers.edit',
  'customers.customer.view',
  'customers.customer.create',
  'customers.customer.edit',
  'customers.phone.view',
  'customers.balance.view',
  'customers.package_credits.view',
  'appointments.receive_bookings',
  'appointments.view_own',
  'appointments.view_all',
  'appointments.edit',
  'appointments.appointment.view',
  'appointments.appointment.manage_all',
  'billing.view',
  'billing.create_invoice',
  'billing.edit_invoice',
  'billing.backdate_invoice',
  'billing.invoice.view',
  'billing.invoice.create',
  'billing.invoice.edit',
  'billing.payment.record',
  'quick_sale.access',
  'quick_sale.customer.search',
  'quick_sale.sale.create',
  'quick_sale.sale.complete',
  'quick_sale.sale.hold',
  'quick_sale.sale.resume',
  'quick_sale.line.add_service',
  'quick_sale.line.add_product',
  'quick_sale.line.add_package',
  'quick_sale.line.remove',
  'quick_sale.discount.apply',
  'quick_sale.payment.record',
  'quick_sale.package.redeem',
  'quick_sale.balance.view',
  'packages.view',
  'packages.package.sell',
  'packages.package.redeem',
  'memberships.view',
  'payments.cash.record',
  'payments.upi.record',
  'payments.card.record',
  'expenses.view',
  'expenses.edit',
  'calendar.view',
  'cash_drawer.view',
  'cash_drawer.manage',
];

/** Front-desk role — create/view/collect only; no admin, inventory, or financial config. */
const RECEPTIONIST_TEMPLATE: WorkforcePermissionKey[] = [
  'dashboard.view',
  'dashboard.view_customers',
  'customers.view',
  'customers.edit',
  'appointments.receive_bookings',
  'appointments.view_all',
  'appointments.edit',
  'billing.view',
  'billing.create_invoice',
  'services.view',
  'packages.view',
  'memberships.view',
  'calendar.view',
  'cash_drawer.view',
];

const STAFF_TEMPLATE: WorkforcePermissionKey[] = [
  'appointments.view_own',
  'appointments.receive_bookings',
  'appointments.appointment.manage_own',
  'calendar.view',
  'customers.view',
  'customers.customer.view',
  'attendance.view_own',
  'attendance.mark',
  'attendance.own.view',
  'attendance.own.mark',
  'performance.own.view',
  'payroll.own.salary.view',
  'payroll.own.payments.view',
  'payroll.own.advance.view',
  'payroll.own.tips.view',
  'payroll.own.incentive.view',
  'finance.view_own_salary',
];

const TEMPLATE_BY_ROLE: Record<
  'owner' | 'manager' | 'receptionist' | 'biller' | 'staff',
  { permissions: WorkforcePermissionKey[]; maxBackdateDays: number | null; maxDiscountPercent: number | null }
> = {
  owner: { permissions: OWNER_TEMPLATE, maxBackdateDays: null, maxDiscountPercent: null },
  manager: { permissions: MANAGER_TEMPLATE, maxBackdateDays: 7, maxDiscountPercent: 25 },
  receptionist: { permissions: RECEPTIONIST_TEMPLATE, maxBackdateDays: 0, maxDiscountPercent: 10 },
  biller: { permissions: BILLER_TEMPLATE, maxBackdateDays: 2, maxDiscountPercent: 15 },
  staff: { permissions: STAFF_TEMPLATE, maxBackdateDays: 0, maxDiscountPercent: 0 },
};

/** Code-default permission templates for the four access roles. */
export const CODE_ROLE_TEMPLATES: Record<
  WorkforceJobRole,
  { permissions: WorkforcePermissionKey[]; maxBackdateDays: number | null; maxDiscountPercent: number | null }
> = {
  owner: TEMPLATE_BY_ROLE.owner,
  manager: TEMPLATE_BY_ROLE.manager,
  receptionist: TEMPLATE_BY_ROLE.receptionist,
  biller: TEMPLATE_BY_ROLE.biller,
  staff: TEMPLATE_BY_ROLE.staff,
  stylist: TEMPLATE_BY_ROLE.staff,
  barber: TEMPLATE_BY_ROLE.staff,
  beautician: TEMPLATE_BY_ROLE.staff,
  makeup_artist: TEMPLATE_BY_ROLE.staff,
  nail_technician: TEMPLATE_BY_ROLE.staff,
  hair_assistant: TEMPLATE_BY_ROLE.staff,
  cleaner: TEMPLATE_BY_ROLE.staff,
  accountant: TEMPLATE_BY_ROLE.biller,
  inventory_manager: TEMPLATE_BY_ROLE.staff,
  intern: TEMPLATE_BY_ROLE.staff,
  housekeeping: TEMPLATE_BY_ROLE.staff,
  security: TEMPLATE_BY_ROLE.staff,
  driver: TEMPLATE_BY_ROLE.staff,
};

export function codeTemplateForAccessRole(accessRole: WorkforceJobRole): WorkforcePermissionGrants {
  const role = normalizeAccessRole(accessRole);
  const key = role as keyof typeof TEMPLATE_BY_ROLE;
  const tpl = TEMPLATE_BY_ROLE[key] ?? TEMPLATE_BY_ROLE.staff;
  return {
    permissions: [...tpl.permissions],
    maxBackdateDays: tpl.maxBackdateDays,
    maxDiscountPercent: tpl.maxDiscountPercent,
  };
}
