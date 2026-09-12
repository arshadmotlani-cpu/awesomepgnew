/**
 * FYHAIR Permission Catalog v2 — granular MODULE.RESOURCE.ACTION keys.
 * Merged into WORKFORCE_PERMISSION_LIBRARY; legacy v1 keys remain for backward compatibility.
 */

import type { WorkforcePermissionDef, WorkforcePermissionGroup } from '@/src/workforce/permissions/library';

type V2Def = WorkforcePermissionDef & {
  module: string;
  resource: string;
  action: string;
  ownerOnly?: boolean;
  sensitive?: boolean;
};

function def(
  key: string,
  label: string,
  group: WorkforcePermissionGroup,
  description: string,
  module: string,
  resource: string,
  action: string,
  opts?: { ownerOnly?: boolean; sensitive?: boolean },
): V2Def {
  return { key, label, group, description, module, resource, action, ...opts };
}

/** Granular v2 permissions — appended to the canonical library. */
export const FYH_PERMISSION_CATALOG_V2: readonly V2Def[] = [
  // --- Customers (field-level) ---
  def('customers.customer.view', 'View customers', 'customers', 'View customer list and profiles', 'customers', 'customer', 'view'),
  def('customers.customer.create', 'Create customers', 'customers', 'Add new customer records', 'customers', 'customer', 'create'),
  def('customers.customer.edit', 'Edit customers', 'customers', 'Update customer records', 'customers', 'customer', 'edit'),
  def('customers.customer.archive', 'Archive customers', 'customers', 'Archive or deactivate customers', 'customers', 'customer', 'archive'),
  def('customers.phone.view', 'View phone numbers', 'customers', 'See customer phone and WhatsApp', 'customers', 'phone', 'view', { sensitive: true }),
  def('customers.pii.view', 'View personal info', 'customers', 'See DOB, address, health notes', 'customers', 'pii', 'view', { sensitive: true }),
  def('customers.history.view', 'View customer history', 'customers', 'See visit and timeline history', 'customers', 'history', 'view'),
  def('customers.balance.view', 'View outstanding balance', 'customers', 'See dues and wallet balance', 'customers', 'balance', 'view', { sensitive: true }),
  def('customers.package_credits.view', 'View package credits', 'customers', 'See package entitlements', 'customers', 'package_credits', 'view'),

  // --- Appointments (scoped) ---
  def('appointments.appointment.view', 'View appointments', 'appointments', 'View appointment calendar', 'appointments', 'appointment', 'view'),
  def('appointments.appointment.create', 'Create appointments', 'appointments', 'Book new appointments', 'appointments', 'appointment', 'create'),
  def('appointments.appointment.edit', 'Edit appointments', 'appointments', 'Modify appointment details', 'appointments', 'appointment', 'edit'),
  def('appointments.appointment.cancel', 'Cancel appointments', 'appointments', 'Cancel bookings', 'appointments', 'appointment', 'cancel'),
  def('appointments.appointment.reschedule', 'Reschedule', 'appointments', 'Move appointment date/time', 'appointments', 'appointment', 'reschedule'),
  def('appointments.appointment.assign_staff', 'Assign staff', 'appointments', 'Assign stylist to appointment', 'appointments', 'appointment', 'assign_staff'),
  def('appointments.appointment.manage_own', 'Manage own appointments', 'appointments', 'Create/edit own assigned appointments', 'appointments', 'appointment', 'manage_own'),
  def('appointments.appointment.manage_all', 'Manage all appointments', 'appointments', 'Full calendar control', 'appointments', 'appointment', 'manage_all'),

  // --- Quick Sale / POS ---
  def('quick_sale.access', 'Open Quick Sale', 'quick_sale', 'Access POS workspace', 'quick_sale', 'pos', 'access'),
  def('quick_sale.customer.search', 'Search customers (POS)', 'quick_sale', 'Find customers in Quick Sale', 'quick_sale', 'customer', 'search'),
  def('quick_sale.sale.create', 'Create sale', 'quick_sale', 'Start a new sale', 'quick_sale', 'sale', 'create'),
  def('quick_sale.sale.complete', 'Complete sale', 'quick_sale', 'Finalize checkout', 'quick_sale', 'sale', 'complete'),
  def('quick_sale.sale.hold', 'Hold bill', 'quick_sale', 'Park bill for later', 'quick_sale', 'sale', 'hold'),
  def('quick_sale.sale.resume', 'Resume held bill', 'quick_sale', 'Load held bill', 'quick_sale', 'sale', 'resume'),
  def('quick_sale.line.add_service', 'Add service line', 'quick_sale', 'Add service to basket', 'quick_sale', 'line', 'add_service'),
  def('quick_sale.line.add_product', 'Add product line', 'quick_sale', 'Add retail product', 'quick_sale', 'line', 'add_product'),
  def('quick_sale.line.add_package', 'Add package line', 'quick_sale', 'Sell package (no performance credit)', 'quick_sale', 'line', 'add_package'),
  def('quick_sale.line.remove', 'Remove line', 'quick_sale', 'Remove basket line', 'quick_sale', 'line', 'remove'),
  def('quick_sale.line.change_price', 'Change line price', 'quick_sale', 'Override unit price', 'quick_sale', 'line', 'change_price'),
  def('quick_sale.line.change_performer', 'Change performer', 'quick_sale', 'Reassign service performer', 'quick_sale', 'line', 'change_performer'),
  def('quick_sale.discount.apply', 'Apply discount', 'quick_sale', 'Apply basket/line discount', 'quick_sale', 'discount', 'apply'),
  def('quick_sale.due.mark', 'Mark amount due', 'quick_sale', 'Complete sale with balance due', 'quick_sale', 'due', 'mark'),
  def('quick_sale.payment.record', 'Record payment', 'quick_sale', 'Record POS payment', 'quick_sale', 'payment', 'record'),
  def('quick_sale.payment.split', 'Split payment', 'quick_sale', 'Multiple payment methods', 'quick_sale', 'payment', 'split'),
  def('quick_sale.package.redeem', 'Redeem package', 'quick_sale', 'Redeem package credits (credits performer)', 'quick_sale', 'package', 'redeem'),
  def('quick_sale.balance.view', 'View customer balance', 'quick_sale', 'See dues in POS', 'quick_sale', 'balance', 'view'),

  // --- Packages ---
  def('packages.package.view', 'View packages', 'packages', 'View package catalog', 'packages', 'package', 'view'),
  def('packages.package.create', 'Create packages', 'packages', 'Create package plans', 'packages', 'package', 'create'),
  def('packages.package.edit', 'Edit packages', 'packages', 'Modify package plans', 'packages', 'package', 'edit'),
  def('packages.package.deactivate', 'Deactivate packages', 'packages', 'Deactivate package plans', 'packages', 'package', 'deactivate'),
  def('packages.package.sell', 'Sell package', 'packages', 'Sell package purchase', 'packages', 'package', 'sell'),
  def('packages.package.redeem', 'Redeem package', 'packages', 'Redeem package credits', 'packages', 'package', 'redeem'),
  def('packages.credits.view', 'View package credits', 'packages', 'View customer credit balance', 'packages', 'credits', 'view'),
  def('packages.credits.adjust', 'Adjust credits', 'packages', 'Manual credit adjustment', 'packages', 'credits', 'adjust', { ownerOnly: true }),
  def('packages.package.refund', 'Refund package', 'packages', 'Refund package purchase', 'packages', 'package', 'refund', { ownerOnly: true }),
  def('packages.financial.view', 'Package financials', 'packages', 'View package revenue data', 'packages', 'financial', 'view', { sensitive: true }),

  // --- Billing (invoice / payment split) ---
  def('billing.invoice.view', 'View invoices', 'billing', 'View invoice register', 'billing', 'invoice', 'view'),
  def('billing.invoice.create', 'Create invoices', 'billing', 'Create invoices', 'billing', 'invoice', 'create'),
  def('billing.invoice.edit', 'Edit invoices', 'billing', 'Modify invoices', 'billing', 'invoice', 'edit'),
  def('billing.invoice.cancel', 'Cancel invoices', 'billing', 'Cancel invoices', 'billing', 'invoice', 'cancel'),
  def('billing.invoice.delete', 'Delete invoices', 'billing', 'Delete where supported', 'billing', 'invoice', 'delete', { ownerOnly: true }),
  def('billing.invoice.print', 'Print invoice', 'billing', 'Print or download invoice', 'billing', 'invoice', 'print'),
  def('billing.invoice.share', 'Share invoice', 'billing', 'Share invoice link', 'billing', 'invoice', 'share'),
  def('billing.invoice.discount.apply', 'Invoice discount', 'billing', 'Apply invoice discount', 'billing', 'invoice', 'discount_apply'),
  def('billing.invoice.price.edit', 'Edit invoice price', 'billing', 'Change line prices', 'billing', 'invoice', 'price_edit'),
  def('billing.invoice.price.edit_final', 'Edit final price', 'billing', 'Override final total', 'billing', 'invoice', 'price_edit_final', { ownerOnly: true }),
  def('billing.payment.view', 'View payments', 'billing', 'View payment records', 'billing', 'payment', 'view'),
  def('billing.payment.record', 'Record payment', 'billing', 'Record invoice payment', 'billing', 'payment', 'record'),
  def('billing.payment.edit', 'Edit payment', 'billing', 'Modify payment entry', 'billing', 'payment', 'edit'),
  def('billing.payment.void', 'Void payment', 'billing', 'Remove/void payment', 'billing', 'payment', 'void', { ownerOnly: true }),
  def('billing.payment.refund', 'Refund payment', 'billing', 'Process refund', 'billing', 'payment', 'refund', { ownerOnly: true }),
  def('billing.payment.reference.view', 'View payment refs', 'billing', 'See UTR/reference numbers', 'billing', 'payment', 'reference_view', { sensitive: true }),

  // --- Payment methods ---
  def('payments.cash.record', 'Cash payments', 'payments', 'Record cash payments', 'payments', 'cash', 'record'),
  def('payments.upi.record', 'UPI payments', 'payments', 'Record UPI payments', 'payments', 'upi', 'record'),
  def('payments.card.record', 'Card payments', 'payments', 'Record card payments', 'payments', 'card', 'record'),
  def('payments.other.record', 'Other payments', 'payments', 'Record other payment methods', 'payments', 'other', 'record'),
  def('payments.correction.edit', 'Payment correction', 'payments', 'Correct payment entries', 'payments', 'correction', 'edit', { ownerOnly: true }),

  // --- Staff performance ---
  def('performance.own.view', 'Own performance', 'performance', 'View own performance metrics', 'performance', 'own', 'view'),
  def('performance.staff.view', 'Staff performance', 'performance', 'View other staff performance', 'performance', 'staff', 'view'),
  def('performance.all.view', 'All performance', 'performance', 'View all staff performance', 'performance', 'all', 'view'),
  def('performance.record.edit', 'Edit performance', 'performance', 'Correct performance records', 'performance', 'record', 'edit', { ownerOnly: true }),
  def('performance.package_redemption.view', 'Redemption performance', 'performance', 'View package redemption metrics', 'performance', 'package_redemption', 'view'),
  def('performance.commission.view', 'Commission calculations', 'performance', 'View commission/incentive math', 'performance', 'commission', 'view', { sensitive: true }),
  def('performance.export', 'Export performance', 'performance', 'Export performance data', 'performance', 'export', 'export'),

  // --- Attendance / leave / shifts ---
  def('attendance.own.view', 'Own attendance', 'staff', 'View own attendance', 'attendance', 'own', 'view'),
  def('attendance.own.mark', 'Mark own attendance', 'staff', 'Clock in/out', 'attendance', 'own', 'mark'),
  def('attendance.staff.view', 'Team attendance', 'staff', 'View other staff attendance', 'attendance', 'staff', 'view'),
  def('attendance.staff.mark', 'Mark team attendance', 'staff', 'Mark attendance for others', 'attendance', 'staff', 'mark'),
  def('attendance.backdate', 'Backdated attendance', 'staff', 'Post attendance for past dates', 'attendance', 'backdate', 'backdate'),
  def('attendance.approve', 'Approve corrections', 'staff', 'Approve attendance corrections', 'attendance', 'approve', 'approve'),
  def('leave.manage', 'Manage leave', 'leave', 'Approve and manage leave', 'leave', 'leave', 'manage'),
  def('shifts.manage', 'Manage shifts', 'shifts', 'Manage staff shifts', 'shifts', 'shifts', 'manage'),

  // --- Payroll (self vs others) ---
  def('payroll.own.salary.view', 'Own salary', 'payroll', 'View own salary', 'payroll', 'own_salary', 'view'),
  def('payroll.own.payments.view', 'Own salary payments', 'payroll', 'View own payment history', 'payroll', 'own_payments', 'view'),
  def('payroll.own.advance.view', 'Own advances', 'payroll', 'View own advances', 'payroll', 'own_advance', 'view'),
  def('payroll.own.tips.view', 'Own tips', 'payroll', 'View own tips', 'payroll', 'own_tips', 'view'),
  def('payroll.own.incentive.view', 'Own incentives', 'payroll', 'View own incentives', 'payroll', 'own_incentive', 'view'),
  def('payroll.salary.view', 'View salaries', 'payroll', 'View all staff salaries', 'payroll', 'salary', 'view', { sensitive: true }),
  def('payroll.salary.generate', 'Generate salary', 'payroll', 'Run payroll generation', 'payroll', 'salary', 'generate', { ownerOnly: true }),
  def('payroll.salary.edit', 'Edit salary', 'payroll', 'Edit salary records', 'payroll', 'salary', 'edit', { ownerOnly: true }),
  def('payroll.salary.approve', 'Approve salary', 'payroll', 'Approve payroll', 'payroll', 'salary', 'approve', { ownerOnly: true }),
  def('payroll.payment.record', 'Record salary payment', 'payroll', 'Pay staff salary', 'payroll', 'payment', 'record', { ownerOnly: true }),
  def('payroll.advance.manage', 'Manage advances', 'payroll', 'Manage staff advances', 'payroll', 'advance', 'manage'),
  def('payroll.tips.manage', 'Manage tips', 'payroll', 'Manage tip distribution', 'payroll', 'tips', 'manage'),
  def('payroll.incentive.manage', 'Manage incentives', 'payroll', 'Manage incentive plans', 'payroll', 'incentive', 'manage'),
  def('payroll.export', 'Export payroll', 'payroll', 'Export salary data', 'payroll', 'export', 'export', { sensitive: true }),

  // --- Staff profiles ---
  def('staff.profile.view', 'View staff profiles', 'staff', 'View team roster', 'staff', 'profile', 'view'),
  def('staff.profile.edit', 'Edit staff profiles', 'staff', 'Edit employee profiles', 'staff', 'profile', 'edit'),
  def('staff.pii.view', 'Staff personal info', 'staff', 'View gov ID and contact', 'staff', 'pii', 'view', { sensitive: true }),
  def('staff.employment.view', 'Employment info', 'staff', 'View role and employment', 'staff', 'employment', 'view'),
  def('staff.banking.view', 'Banking info', 'staff', 'View bank/UPI details', 'staff', 'banking', 'view', { ownerOnly: true, sensitive: true }),
  def('staff.documents.view', 'View documents', 'staff', 'View uploaded documents', 'staff', 'documents', 'view'),
  def('staff.documents.upload', 'Upload documents', 'staff', 'Upload staff documents', 'staff', 'documents', 'upload'),
  def('staff.documents.delete', 'Delete documents', 'staff', 'Remove staff documents', 'staff', 'documents', 'delete', { ownerOnly: true }),

  // --- Inventory extended ---
  def('inventory.product.view', 'View products', 'inventory', 'View product catalog', 'inventory', 'product', 'view'),
  def('inventory.product.create', 'Create products', 'inventory', 'Add products', 'inventory', 'product', 'create'),
  def('inventory.product.edit', 'Edit products', 'inventory', 'Modify products', 'inventory', 'product', 'edit'),
  def('inventory.product.archive', 'Archive products', 'inventory', 'Archive products', 'inventory', 'product', 'archive'),
  def('inventory.stock.adjust', 'Adjust stock', 'inventory', 'Manual stock adjustment', 'inventory', 'stock', 'adjust'),
  def('inventory.stock.inward', 'Stock inward', 'inventory', 'Record stock inward', 'inventory', 'stock', 'inward'),
  def('inventory.stock.return', 'Stock return', 'inventory', 'Process stock returns', 'inventory', 'stock', 'return'),
  def('inventory.purchase.create', 'Create PO', 'inventory', 'Create purchase order', 'inventory', 'purchase', 'create'),
  def('inventory.purchase.approve', 'Approve PO', 'inventory', 'Approve purchase order', 'inventory', 'purchase', 'approve', { ownerOnly: true }),
  def('inventory.reports.view', 'Inventory reports', 'inventory', 'View inventory reports', 'inventory', 'reports', 'view'),
  def('inventory.valuation.view', 'Stock valuation', 'inventory', 'View stock valuation', 'inventory', 'valuation', 'view', { sensitive: true }),

  // --- Expenses / petty cash ---
  def('expenses.expense.view', 'View expenses', 'expenses', 'View expense records', 'expenses', 'expense', 'view'),
  def('expenses.expense.create', 'Create expenses', 'expenses', 'Record expenses', 'expenses', 'expense', 'create'),
  def('expenses.expense.edit', 'Edit expenses', 'expenses', 'Modify expenses', 'expenses', 'expense', 'edit'),
  def('expenses.expense.approve', 'Approve expenses', 'expenses', 'Approve expense claims', 'expenses', 'expense', 'approve'),
  def('expenses.expense.cancel', 'Cancel expenses', 'expenses', 'Cancel expense records', 'expenses', 'expense', 'cancel'),
  def('expenses.export', 'Export expenses', 'expenses', 'Export expense data', 'expenses', 'export', 'export'),
  def('petty_cash.view', 'View petty cash', 'petty_cash', 'View petty cash ledger', 'petty_cash', 'ledger', 'view'),
  def('petty_cash.transaction.add', 'Add petty cash', 'petty_cash', 'Add petty cash transaction', 'petty_cash', 'transaction', 'add'),
  def('petty_cash.transaction.approve', 'Approve petty cash', 'petty_cash', 'Approve transactions', 'petty_cash', 'transaction', 'approve'),
  def('petty_cash.transaction.edit', 'Edit petty cash', 'petty_cash', 'Correct transactions', 'petty_cash', 'transaction', 'edit'),
  def('petty_cash.reconcile', 'Reconcile petty cash', 'petty_cash', 'Close/reconcile petty cash', 'petty_cash', 'reconcile', 'reconcile', { ownerOnly: true }),

  // --- Reports (per type) ---
  def('reports.revenue.view', 'Revenue report', 'reports', 'View revenue reports', 'reports', 'revenue', 'view'),
  def('reports.sales.view', 'Sales report', 'reports', 'View sales reports', 'reports', 'sales', 'view'),
  def('reports.payments.view', 'Payments report', 'reports', 'View payment reports', 'reports', 'payments', 'view'),
  def('reports.customer.view', 'Customer report', 'reports', 'View customer reports', 'reports', 'customer', 'view'),
  def('reports.performance.view', 'Performance report', 'reports', 'View staff performance reports', 'reports', 'performance', 'view'),
  def('reports.attendance.view', 'Attendance report', 'reports', 'View attendance reports', 'reports', 'attendance', 'view'),
  def('reports.salary.view', 'Salary report', 'reports', 'View salary reports', 'reports', 'salary', 'view', { sensitive: true }),
  def('reports.inventory.view', 'Inventory report', 'reports', 'View inventory reports', 'reports', 'inventory', 'view'),
  def('reports.expenses.view', 'Expenses report', 'reports', 'View expense reports', 'reports', 'expenses', 'view'),
  def('reports.profitability.view', 'Profitability report', 'reports', 'View profit reports', 'reports', 'profitability', 'view', { sensitive: true }),
];

export type FyhPermissionV2Key = (typeof FYH_PERMISSION_CATALOG_V2)[number]['key'];
