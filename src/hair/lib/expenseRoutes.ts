export const EXPENSES_GENERAL_HREF = '/expenses';
export const EXPENSES_SALARY_HREF = '/expenses/salary';

export function isExpensesSectionPath(pathname: string): boolean {
  return pathname === EXPENSES_GENERAL_HREF || pathname.startsWith(`${EXPENSES_GENERAL_HREF}/`);
}
