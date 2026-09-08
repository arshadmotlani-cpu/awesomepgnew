'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { EXPENSES_SALARY_HREF } from '@/src/hair/lib/expenseRoutes';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { getSalonSettings } from '@/src/hair/services/settings';
import { defaultPayrollMonthKey } from '@/src/workforce/lib/payrollAvailability';
import {
  loadOwnPayrollLineDetail,
  loadPayrollRunDetail,
  recordPayrollPayment,
} from '@/src/workforce/services/payroll';
import { requireWorkforcePermission } from '@/src/workforce/permissions/guards';
import {
  canManagePayroll,
  canPaySalary,
  canViewOwnSalary,
  canViewSalaryQr,
  canViewTeamPayroll,
  getPayrollUiPermissions,
} from '@/src/workforce/permissions/payrollAccess';

export type PayrollActionState = { error?: string; success?: string };

async function requirePayrollActor() {
  const session = await getHairSession();
  if (!session) redirect('/login?next=/expenses/salary');
  if (!session.workforceEmployeeId && session.admin.role !== 'super_admin') {
    redirect('/login?next=/expenses/salary');
  }
  return session;
}

export { canViewTeamPayroll, canViewOwnSalary, getPayrollUiPermissions };

export async function markPayrollPaidAction(
  _prev: PayrollActionState,
  formData: FormData,
): Promise<PayrollActionState> {
  try {
    const session = await requirePayrollActor();
    await requireWorkforcePermission('finance.pay_salary');

    const payrollLineId = String(formData.get('payrollLineId') ?? '').trim();
    const paymentMethod = String(formData.get('paymentMethod') ?? 'upi').trim();
    const paymentReference = String(formData.get('paymentReference') ?? '').trim() || null;
    if (!payrollLineId) return { error: 'Missing payroll line.' };

    const ctx = await getTenantContextForPage();
    await recordPayrollPayment({
      payrollLineId,
      paymentMethod,
      paymentReference,
      paidByEmployeeId: session.workforceEmployeeId,
      ctx,
    });

    revalidatePath(EXPENSES_SALARY_HREF);
    return { success: 'Salary payment recorded.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not record payment.' };
  }
}

export async function loadOwnerPayrollPage(monthKey?: string) {
  await requirePayrollActor();
  await requireWorkforcePermission('finance.view_salary');

  const ctx = await getTenantContextForPage();
  const settings = await getSalonSettings();
  const timezone = settings.timezone ?? 'Asia/Kolkata';
  const canManage = await canManagePayroll();
  const uiPermissions = await getPayrollUiPermissions();
  const detail = await loadPayrollRunDetail({
    monthKey: monthKey ?? defaultPayrollMonthKey(timezone),
    timezone,
    ctx,
    allowCreate: canManage,
    includePaymentDetails: uiPermissions.canViewQr,
  });
  return { detail, timezone, uiPermissions };
}

export async function loadStaffPayrollPage(monthKey?: string) {
  const session = await requirePayrollActor();
  const canTeam = await canViewTeamPayroll();
  if (canTeam) return { line: null, canTeam: true as const, monthKey: monthKey ?? null };

  if (!session.workforceEmployeeId) redirect('/login?next=/expenses/salary');
  if (!(await canViewOwnSalary())) redirect('/me');

  const ctx = await getTenantContextForPage();
  const settings = await getSalonSettings();
  const timezone = settings.timezone ?? 'Asia/Kolkata';
  const resolvedMonth = monthKey ?? defaultPayrollMonthKey(timezone);
  const line = await loadOwnPayrollLineDetail({
    employeeId: session.workforceEmployeeId,
    monthKey: resolvedMonth,
    timezone,
    ctx,
    allowCreate: false,
    includePaymentDetails: true,
  });
  return { line, canTeam: false as const, monthKey: resolvedMonth };
}
