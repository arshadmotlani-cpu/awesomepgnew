/**
 * FYH authoritative rights — implied grants (edit includes view, bundles, salon includes personal).
 * Applied at permission check time so changes take effect on the next request without re-login.
 */

/** Granting `key` also satisfies these required keys when checking access. */
export const FYH_GRANT_IMPLIES: Record<string, readonly string[]> = {
  'dashboard.full': [
    'dashboard.view',
    'dashboard.view_revenue',
    'dashboard.view_staff',
    'dashboard.view_customers',
    'dashboard.view_expenses',
    'dashboard.view_appointments',
    'dashboard.revenue.personal',
    'dashboard.revenue.salon',
    'performance.all.view',
    'performance.staff.view',
    'performance.own.view',
  ],
  'dashboard.view_expenses': ['dashboard.view_expenses'],
  'dashboard.view_appointments': ['dashboard.view_appointments'],
  'dashboard.revenue.salon': [
    'dashboard.revenue.personal',
    'dashboard.view_revenue',
    'dashboard.view_staff',
    'performance.all.view',
    'performance.staff.view',
  ],
  'dashboard.revenue.personal': ['performance.own.view', 'dashboard.view_staff'],
  'customers.view': [
    'customers.customer.view',
    'customers.phone.view',
    'customers.pii.view',
    'customers.history.view',
    'customers.balance.view',
    'customers.package_credits.view',
    'customers.view',
  ],
  'appointments.edit': [
    'appointments.view_own',
    'appointments.appointment.edit',
    'appointments.appointment.cancel',
    'appointments.appointment.view',
    'appointments.edit',
  ],
  'appointments.add': ['appointments.appointment.create'],
  'appointments.view_all': ['appointments.view_all', 'appointments.appointment.view', 'appointments.view_own'],
  'appointments.view_own': ['appointments.view_own', 'appointments.appointment.manage_own'],
  'appointments.bookable': ['appointments.receive_bookings'],
  'billing.bill.edit': [
    'billing.invoices.view',
    'billing.invoice.view',
    'billing.view',
    'billing.edit_invoice',
    'billing.invoice.edit',
    'billing.payment.refund',
    'billing.payment.void',
  ],
  'billing.bill.create': [
    'billing.invoice.create',
    'billing.create_invoice',
    'billing.invoice.view',
    'billing.view',
    'quick_sale.access',
    'quick_sale.sale.create',
    'quick_sale.sale.complete',
    'quick_sale.payment.record',
    'quick_sale.payment.split',
    'quick_sale.due.mark',
    'quick_sale.package.redeem',
    'action:billing.checkout',
  ],
  'billing.invoices.view': ['billing.invoice.view', 'billing.view'],
  'configuration.edit': ['configuration.view', 'configuration.edit', 'settings.manage', 'action:settings.edit'],
  'configuration.view': ['configuration.view', 'settings.view', 'services.view', 'products.view', 'packages.view', 'memberships.view'],
  'staff.edit': ['staff.view', 'staff.add', 'staff.profile.view', 'staff.profile.edit', 'permissions.manage'],
  'staff.view': ['staff.view', 'staff.profile.view'],
  'expenses.general.edit': ['expenses.general.view', 'expenses.expense.view', 'expenses.expense.edit', 'expenses.edit'],
  'expenses.general.add': ['expenses.general.view', 'expenses.expense.create'],
  'expenses.general.view': ['expenses.expense.view', 'expenses.view'],
  'expenses.salary.edit': ['expenses.salary.view', 'finance.manage_salary', 'payroll.salary.edit'],
  'expenses.salary.add': ['expenses.salary.view', 'finance.manage_salary'],
  'expenses.salary.view': ['finance.view_salary', 'payroll.salary.view', 'reports.salary.view'],
  'reports.export': ['reports.export', 'action:reports.export'],
  'reports.edit': ['reports.view', 'reports.edit'],
  'reports.view': ['reports.view', 'reports.revenue.view'],
};

/** Expand granted keys with implied permissions (one level + transitive for dashboard.full). */
export function expandGrantedPermissions(granted: readonly string[]): Set<string> {
  const out = new Set<string>(granted);
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of [...out]) {
      const implied = FYH_GRANT_IMPLIES[g];
      if (!implied) continue;
      for (const key of implied) {
        if (!out.has(key)) {
          out.add(key);
          changed = true;
        }
      }
    }
  }
  return out;
}

export function grantSetSatisfies(grantedExpanded: Set<string>, requiredKey: string): boolean {
  if (grantedExpanded.has(requiredKey)) return true;
  for (const g of grantedExpanded) {
    const implied = FYH_GRANT_IMPLIES[g];
    if (implied?.includes(requiredKey)) return true;
  }
  return false;
}
