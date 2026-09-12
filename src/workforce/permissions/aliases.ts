/**
 * Permission alias resolution — v2 keys, v1 workforce keys, and legacy Hair keys.
 * A grant satisfies a required key if it matches directly or via alias expansion.
 */

import type { HairPermission } from '@/src/hair/lib/auth/permissionTypes';
import type { WorkforcePermissionKey } from '@/src/workforce/permissions/library';

/** v2 required key → v1 workforce keys that satisfy it. */
export const V2_TO_V1_ALIASES: Record<string, readonly WorkforcePermissionKey[]> = {
  'customers.customer.view': ['customers.view'],
  'customers.customer.create': ['customers.edit'],
  'customers.customer.edit': ['customers.edit'],
  'customers.customer.archive': ['customers.edit'],
  'appointments.appointment.view': ['appointments.view_all', 'appointments.view_own'],
  'appointments.appointment.create': ['appointments.edit'],
  'appointments.appointment.edit': ['appointments.edit'],
  'appointments.appointment.cancel': ['appointments.edit'],
  'appointments.appointment.reschedule': ['appointments.edit'],
  'appointments.appointment.assign_staff': ['appointments.edit'],
  'appointments.appointment.manage_own': ['appointments.view_own', 'appointments.edit'],
  'appointments.appointment.manage_all': ['appointments.view_all', 'appointments.edit'],
  'quick_sale.access': ['billing.create_invoice', 'billing.edit_invoice'],
  'quick_sale.customer.search': ['customers.view', 'billing.create_invoice'],
  'quick_sale.sale.create': ['billing.create_invoice'],
  'quick_sale.sale.complete': ['billing.create_invoice'],
  'quick_sale.sale.hold': ['billing.create_invoice'],
  'quick_sale.sale.resume': ['billing.create_invoice'],
  'quick_sale.line.add_service': ['billing.create_invoice'],
  'quick_sale.line.add_product': ['billing.create_invoice'],
  'quick_sale.line.add_package': ['billing.create_invoice', 'packages.view'],
  'quick_sale.line.remove': ['billing.edit_invoice'],
  'quick_sale.line.change_price': ['billing.edit_invoice'],
  'quick_sale.line.change_performer': ['billing.edit_invoice'],
  'quick_sale.discount.apply': ['billing.create_invoice', 'billing.edit_invoice'],
  'quick_sale.due.mark': ['billing.create_invoice'],
  'quick_sale.payment.record': ['billing.create_invoice'],
  'quick_sale.payment.split': ['billing.create_invoice'],
  'quick_sale.package.redeem': ['billing.create_invoice', 'packages.view'],
  'quick_sale.balance.view': ['customers.view', 'billing.view'],
  'packages.package.view': ['packages.view'],
  'packages.package.create': ['packages.edit'],
  'packages.package.edit': ['packages.edit'],
  'packages.package.deactivate': ['packages.edit'],
  'packages.package.sell': ['packages.view', 'billing.create_invoice'],
  'packages.package.redeem': ['packages.view', 'billing.create_invoice'],
  'packages.credits.view': ['packages.view', 'customers.view'],
  'packages.credits.adjust': ['packages.edit'],
  'packages.package.refund': ['billing.approve_refund'],
  'packages.financial.view': ['packages.view', 'finance.view_profit'],
  'billing.invoice.view': ['billing.view'],
  'billing.invoice.create': ['billing.create_invoice'],
  'billing.invoice.edit': ['billing.edit_invoice'],
  'billing.invoice.cancel': ['billing.edit_invoice'],
  'billing.invoice.delete': ['records.delete'],
  'billing.invoice.print': ['billing.view'],
  'billing.invoice.share': ['billing.view'],
  'billing.invoice.discount.apply': ['billing.create_invoice', 'billing.edit_invoice'],
  'billing.invoice.price.edit': ['billing.edit_invoice'],
  'billing.invoice.price.edit_final': ['billing.edit_invoice', 'billing.approve_discount'],
  'billing.payment.view': ['billing.view'],
  'billing.payment.record': ['billing.create_invoice'],
  'billing.payment.edit': ['billing.edit_invoice'],
  'billing.payment.void': ['billing.edit_invoice'],
  'billing.payment.refund': ['billing.approve_refund'],
  'billing.payment.reference.view': ['billing.view'],
  'payments.cash.record': ['billing.create_invoice'],
  'payments.upi.record': ['billing.create_invoice'],
  'payments.card.record': ['billing.create_invoice'],
  'payments.other.record': ['billing.create_invoice'],
  'payments.correction.edit': ['billing.edit_invoice'],
  'performance.own.view': ['dashboard.view_staff', 'appointments.view_own'],
  'performance.staff.view': ['dashboard.view_staff'],
  'performance.all.view': ['dashboard.view_staff'],
  'performance.record.edit': ['staff.edit'],
  'performance.package_redemption.view': ['dashboard.view_staff'],
  'performance.commission.view': ['staff.view_financials', 'dashboard.view_staff'],
  'performance.export': ['reports.export', 'dashboard.view_staff'],
  'attendance.own.view': ['attendance.view_own'],
  'attendance.own.mark': ['attendance.mark'],
  'attendance.staff.view': ['attendance.view_team'],
  'attendance.staff.mark': ['attendance.correct'],
  'attendance.backdate': ['attendance.correct'],
  'attendance.approve': ['attendance.correct'],
  'leave.manage': ['staff.edit'],
  'shifts.manage': ['staff.edit', 'calendar.edit'],
  'payroll.own.salary.view': ['finance.view_own_salary'],
  'payroll.own.payments.view': ['finance.view_own_salary'],
  'payroll.own.advance.view': ['finance.view_own_salary'],
  'payroll.own.tips.view': ['finance.view_own_salary'],
  'payroll.own.incentive.view': ['finance.view_own_salary'],
  'payroll.salary.view': ['finance.view_salary'],
  'payroll.salary.generate': ['finance.manage_salary'],
  'payroll.salary.edit': ['finance.manage_salary'],
  'payroll.salary.approve': ['finance.manage_salary'],
  'payroll.payment.record': ['finance.pay_salary'],
  'payroll.advance.manage': ['finance.manage_salary'],
  'payroll.tips.manage': ['finance.manage_salary'],
  'payroll.incentive.manage': ['finance.manage_salary'],
  'payroll.export': ['payroll.view_reports'],
  'staff.profile.view': ['staff.view'],
  'staff.profile.edit': ['staff.edit'],
  'staff.pii.view': ['staff.view'],
  'staff.employment.view': ['staff.view'],
  'staff.banking.view': ['staff.view_financials', 'finance.view_salary_qr'],
  'staff.documents.view': ['staff.view'],
  'staff.documents.upload': ['staff.edit'],
  'staff.documents.delete': ['staff.edit'],
  'inventory.product.view': ['products.view', 'inventory.view'],
  'inventory.product.create': ['products.edit'],
  'inventory.product.edit': ['products.edit'],
  'inventory.product.archive': ['products.edit'],
  'inventory.stock.adjust': ['inventory.edit'],
  'inventory.stock.inward': ['inventory.edit'],
  'inventory.stock.return': ['inventory.edit'],
  'inventory.purchase.create': ['inventory.edit'],
  'inventory.purchase.approve': ['inventory.edit'],
  'inventory.reports.view': ['inventory.view', 'reports.view'],
  'inventory.valuation.view': ['inventory.view', 'finance.view_profit'],
  'expenses.expense.view': ['expenses.view'],
  'expenses.expense.create': ['expenses.edit'],
  'expenses.expense.edit': ['expenses.edit'],
  'expenses.expense.approve': ['expenses.edit'],
  'expenses.expense.cancel': ['expenses.edit'],
  'expenses.export': ['reports.export', 'expenses.view'],
  'petty_cash.view': ['cash_drawer.view'],
  'petty_cash.transaction.add': ['cash_drawer.manage'],
  'petty_cash.transaction.approve': ['cash_drawer.manage'],
  'petty_cash.transaction.edit': ['cash_drawer.manage'],
  'petty_cash.reconcile': ['cash_drawer.manage'],
  'reports.revenue.view': ['reports.view', 'dashboard.view_revenue'],
  'reports.sales.view': ['reports.view'],
  'reports.payments.view': ['reports.view'],
  'reports.customer.view': ['reports.view', 'customers.view'],
  'reports.performance.view': ['reports.view', 'dashboard.view_staff'],
  'reports.attendance.view': ['reports.view', 'attendance.view_team'],
  'reports.salary.view': ['payroll.view_reports', 'finance.view_salary'],
  'reports.inventory.view': ['reports.view', 'inventory.view'],
  'reports.expenses.view': ['reports.view', 'finance.view_expenses'],
  'reports.profitability.view': ['reports.view', 'finance.view_profit'],
};

/** Legacy Hair page/action key → v2 workforce keys. */
export const LEGACY_HAIR_TO_V2: Record<HairPermission, readonly string[]> = {
  'page:dashboard': ['dashboard.view'],
  'page:dashboard_revenue': ['dashboard.view_revenue', 'reports.revenue.view'],
  'page:dashboard_staff': ['dashboard.view_staff', 'performance.all.view'],
  'page:customers': ['customers.customer.view'],
  'page:appointments': ['appointments.appointment.view'],
  'page:billing': ['billing.invoice.view'],
  'page:quick_sale': ['quick_sale.access'],
  'page:services': ['services.view'],
  'page:memberships': ['memberships.view'],
  'page:packages': ['packages.package.view'],
  'page:inventory': ['inventory.product.view', 'inventory.view'],
  'page:purchases': ['inventory.purchase.create', 'inventory.view'],
  'page:expenses': ['expenses.expense.view'],
  'page:reports': ['reports.revenue.view'],
  'page:settings': ['settings.view'],
  'action:inventory.adjust': ['inventory.stock.adjust'],
  'action:billing.checkout': ['quick_sale.sale.complete', 'billing.invoice.create'],
  'action:reports.export': ['reports.export'],
  'action:settings.edit': ['settings.manage', 'configuration.edit'],
  'action:staff.commission_pay': ['performance.record.edit', 'payroll.incentive.manage'],
  'action:packages.edit': ['packages.package.edit'],
  'action:import.historical': ['settings.manage'],
};

/** Build reverse index: granted key → all keys it satisfies (including itself). */
function buildSatisfactionIndex(): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  const add = (grant: string, satisfies: string) => {
    if (!index.has(grant)) index.set(grant, new Set());
    index.get(grant)!.add(satisfies);
    index.get(grant)!.add(grant);
  };

  for (const [v2, v1List] of Object.entries(V2_TO_V1_ALIASES)) {
    add(v2, v2);
    for (const v1 of v1List) {
      add(v1, v2);
      add(v1, v1);
    }
  }

  for (const [legacy, v2List] of Object.entries(LEGACY_HAIR_TO_V2)) {
    for (const v2 of v2List) {
      add(legacy, v2);
      add(legacy, legacy);
    }
  }

  return index;
}

const SATISFACTION_INDEX = buildSatisfactionIndex();

/** Returns true if any granted key satisfies the required permission key. */
export function permissionSatisfied(
  grantedKeys: readonly string[],
  requiredKey: string,
): boolean {
  if (grantedKeys.includes(requiredKey)) return true;

  for (const grant of grantedKeys) {
    const satisfies = SATISFACTION_INDEX.get(grant);
    if (satisfies?.has(requiredKey)) return true;
  }

  // Direct v1 alias check for required v2 key
  const v1Aliases = V2_TO_V1_ALIASES[requiredKey];
  if (v1Aliases?.some((v1) => grantedKeys.includes(v1))) return true;

  return false;
}

/** Resolve a legacy Hair permission to v2 keys for workforce checks. */
export function legacyHairKeyToV2(legacyKey: HairPermission): string[] {
  return [...(LEGACY_HAIR_TO_V2[legacyKey] ?? [])];
}
