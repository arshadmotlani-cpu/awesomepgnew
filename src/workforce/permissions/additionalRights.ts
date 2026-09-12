import { permissionDef, type WorkforcePermissionKey } from '@/src/workforce/permissions/library';
import { FYH_PERMISSION_CATALOG_V2 } from '@/src/workforce/permissions/catalogV2';

/**
 * Sensitive / elevated permissions shown in a dedicated "Additional Rights" section.
 * All other permissions are in the full module matrix.
 */
export const WORKFORCE_ADDITIONAL_RIGHTS: readonly WorkforcePermissionKey[] = [
  // Finance / payroll
  'finance.view_salary',
  'finance.manage_salary',
  'finance.pay_salary',
  'finance.view_salary_qr',
  'payroll.salary.view',
  'payroll.salary.generate',
  'payroll.salary.approve',
  'payroll.payment.record',
  'payroll.export',
  'staff.view_financials',
  'staff.banking.view',
  // Attendance admin
  'attendance.view_team',
  'attendance.correct',
  'attendance.manage_office',
  'attendance.staff.mark',
  'attendance.backdate',
  // Staff admin
  'staff.add',
  'staff.edit',
  'permissions.manage',
  // Billing sensitive
  'billing.payment.refund',
  'billing.payment.void',
  'billing.invoice.delete',
  'payments.correction.edit',
  'packages.credits.adjust',
  'packages.package.refund',
  // Reports sensitive
  'reports.salary.view',
  'reports.profitability.view',
  'payroll.view_reports',
] as const;

/** v2 sensitive keys for matrix filtering */
export const SENSITIVE_V2_KEYS = new Set(
  FYH_PERMISSION_CATALOG_V2.filter((d) => d.sensitive || d.ownerOnly).map((d) => d.key),
);

export function isAdditionalRightKey(key: string): boolean {
  return (WORKFORCE_ADDITIONAL_RIGHTS as readonly string[]).includes(key);
}

export function additionalRightsDefs() {
  return WORKFORCE_ADDITIONAL_RIGHTS.map((key) => permissionDef(key)).filter(
    (def): def is NonNullable<ReturnType<typeof permissionDef>> => def != null,
  );
}
