import { permissionDef, type WorkforcePermissionKey } from '@/src/workforce/permissions/library';

/** Curated owner-grantable rights shown in Additional Rights UI (compact, with bracket hints). */
export const WORKFORCE_ADDITIONAL_RIGHTS: readonly WorkforcePermissionKey[] = [
  'finance.view_salary',
  'finance.manage_salary',
  'finance.pay_salary',
  'finance.view_salary_qr',
  'finance.view_own_salary',
  'attendance.view_team',
  'attendance.correct',
  'attendance.manage_office',
  'payroll.view_reports',
  'staff.view_financials',
  'staff.add',
  'staff.edit',
  'staff.view',
] as const;

export function isAdditionalRightKey(key: string): boolean {
  return (WORKFORCE_ADDITIONAL_RIGHTS as readonly string[]).includes(key);
}

export function additionalRightsDefs() {
  return WORKFORCE_ADDITIONAL_RIGHTS.map((key) => permissionDef(key)).filter(
    (def): def is NonNullable<ReturnType<typeof permissionDef>> => def != null,
  );
}
