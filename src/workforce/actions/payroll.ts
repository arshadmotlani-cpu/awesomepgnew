'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { EXPENSES_SALARY_HREF } from '@/src/hair/lib/expenseRoutes';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { getSalonSettings } from '@/src/hair/services/settings';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import { defaultPayrollMonthKey } from '@/src/workforce/lib/payrollAvailability';
import {
  loadOwnPayrollLineDetail,
  loadPayrollRunDetail,
  recordPayrollPayment,
} from '@/src/workforce/services/payroll';
import { requireWorkforcePermission } from '@/src/workforce/permissions/guards';

export type PayrollActionState = { error?: string; success?: string };

async function requirePayrollActor() {
  const session = await getHairSession();
  if (!session) redirect('/login?next=/expenses/salary');
  if (!session.workforceEmployeeId && session.admin.role !== 'super_admin') {
    redirect('/login?next=/expenses/salary');
  }
  return session;
}

export async function canViewTeamPayroll(): Promise<boolean> {
  const session = await getHairSession();
  if (!session) return false;
  if (session.admin.role === 'super_admin') return true;
  if (!session.workforceEmployeeId) return false;
  return employeeHasPermission(session.workforceEmployeeId, 'fyh_salon', 'finance.view_salary');
}

export async function markPayrollPaidAction(
  _prev: PayrollActionState,
  formData: FormData,
): Promise<PayrollActionState> {
  try {
    const session = await requirePayrollActor();
    await requireWorkforcePermission('finance.view_salary');

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
  const canTeam = await canViewTeamPayroll();
  if (!canTeam) redirect('/expenses/salary');

  const ctx = await getTenantContextForPage();
  const settings = await getSalonSettings();
  const timezone = settings.timezone ?? 'Asia/Kolkata';
  const detail = await loadPayrollRunDetail({
    monthKey: monthKey ?? defaultPayrollMonthKey(timezone),
    timezone,
    ctx,
  });
  return { detail, timezone };
}

export async function loadStaffPayrollPage(monthKey?: string) {
  const session = await requirePayrollActor();
  const canTeam = await canViewTeamPayroll();
  if (canTeam) return { line: null, canTeam: true as const, monthKey: monthKey ?? null };

  if (!session.workforceEmployeeId) redirect('/login?next=/expenses/salary');

  const ctx = await getTenantContextForPage();
  const settings = await getSalonSettings();
  const timezone = settings.timezone ?? 'Asia/Kolkata';
  const resolvedMonth = monthKey ?? defaultPayrollMonthKey(timezone);
  const line = await loadOwnPayrollLineDetail({
    employeeId: session.workforceEmployeeId,
    monthKey: resolvedMonth,
    timezone,
    ctx,
  });
  return { line, canTeam: false as const, monthKey: resolvedMonth };
}
