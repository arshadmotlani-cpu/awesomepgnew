import { getHairSession } from '@/src/hair/lib/auth/session';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import type { WorkforceEngineId } from '@/src/workforce/types';

const ENGINE: WorkforceEngineId = 'fyh_salon';

async function sessionCan(key: Parameters<typeof employeeHasPermission>[2]): Promise<boolean> {
  const session = await getHairSession();
  if (!session) return false;
  if (session.admin.role === 'super_admin') return true;
  if (!session.workforceEmployeeId) return false;
  return employeeHasPermission(session.workforceEmployeeId, ENGINE, key);
}

export async function canViewTeamPayroll(): Promise<boolean> {
  return sessionCan('finance.view_salary');
}

export async function canManagePayroll(): Promise<boolean> {
  return sessionCan('finance.manage_salary');
}

export async function canPaySalary(): Promise<boolean> {
  return sessionCan('finance.pay_salary');
}

export async function canViewSalaryQr(): Promise<boolean> {
  return sessionCan('finance.view_salary_qr');
}

export async function canViewOwnSalary(): Promise<boolean> {
  return sessionCan('finance.view_own_salary');
}

export async function getPayrollUiPermissions() {
  const [canViewTeam, canManage, canPay, canViewQr] = await Promise.all([
    canViewTeamPayroll(),
    canManagePayroll(),
    canPaySalary(),
    canViewSalaryQr(),
  ]);
  return { canViewTeam, canManage, canPay, canViewQr };
}
