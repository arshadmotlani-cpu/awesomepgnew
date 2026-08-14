'use server';

import { revalidatePath } from 'next/cache';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import { clockIn, clockOut } from '@/src/workforce/services/attendance';
import { createIncentive, updateCommissionDefaults, updatePerformanceTarget } from '@/src/workforce/services/compensation';
import { defaultWeeklySchedule, upsertEmployeeWeeklySchedule } from '@/src/workforce/services/schedules';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import { parseScheduleDaysFromForm } from '@/src/workforce/actions/parseHrForm';
import { requireWorkforcePermission, WorkforcePermissionError } from '@/src/workforce/permissions/guards';
import { validateScheduleDays } from '@/src/workforce/lib/scheduleEditor';

export type WorkforceScheduleActionState = { error?: string; success?: string };

async function requireActor() {
  if (!isWorkforceEngineEnabled()) throw new Error('Workforce Engine is not enabled');
  const session = await getHairSession();
  if (!session?.workforceEmployeeId) throw new Error('Not signed in');
  return session.workforceEmployeeId;
}

async function resolveScheduleEditor(targetEmployeeId: string): Promise<{ actorEmployeeId: string | null }> {
  const session = await getHairSession();
  if (!session) throw new WorkforcePermissionError('Please sign in again.');

  if (session.workforceEmployeeId === targetEmployeeId) {
    return { actorEmployeeId: session.workforceEmployeeId };
  }

  await requireWorkforcePermission('staff.edit');
  return { actorEmployeeId: session.workforceEmployeeId ?? null };
}

export async function clockInAction(): Promise<void> {
  const employeeId = await requireActor();
  await clockIn({ employeeId });
  revalidatePath('/me');
  revalidatePath('/workforce/operations');
}

export async function clockOutAction(): Promise<void> {
  const employeeId = await requireActor();
  await clockOut({ employeeId });
  revalidatePath('/me');
  revalidatePath('/workforce/operations');
}

export async function seedDefaultScheduleAction(
  employeeId: string,
  _formData?: FormData,
): Promise<void> {
  const actorId = await requireActor();
  const canEdit =
    actorId === employeeId ||
    (await employeeHasPermission(actorId, 'fyh_salon', 'staff.edit'));
  if (!canEdit) throw new Error('Not allowed');

  await upsertEmployeeWeeklySchedule({
    employeeId,
    days: defaultWeeklySchedule(),
    actorEmployeeId: actorId,
  });
  revalidatePath('/workforce/operations');
  revalidatePath('/me');
}

export async function saveWeeklyScheduleAction(
  _prev: WorkforceScheduleActionState,
  formData: FormData,
): Promise<WorkforceScheduleActionState> {
  try {
    if (!isWorkforceEngineEnabled()) {
      return { error: 'Workforce Engine is not enabled.' };
    }
    const employeeId = String(formData.get('employeeId') ?? '').trim();
    if (!employeeId) return { error: 'Missing employee.' };

    const { actorEmployeeId } = await resolveScheduleEditor(employeeId);
    const days = parseScheduleDaysFromForm(formData);
    validateScheduleDays(days);

    await upsertEmployeeWeeklySchedule({
      employeeId,
      days,
      actorEmployeeId,
    });
    revalidatePath('/workforce/operations');
    revalidatePath('/me');
    revalidatePath('/staff');
    revalidatePath(`/staff/${employeeId}`);
    return { success: 'Working hours saved.' };
  } catch (e) {
    const message =
      e instanceof WorkforcePermissionError
        ? 'You do not have permission to update this schedule.'
        : e instanceof Error
          ? e.message
          : 'Failed to save working hours.';
    return { error: message };
  }
}

export async function setCommissionAction(formData: FormData): Promise<void> {
  const actorId = await requireActor();
  if (!(await employeeHasPermission(actorId, 'fyh_salon', 'staff.edit'))) {
    throw new Error('Not allowed');
  }
  const employeeId = String(formData.get('employeeId') ?? '');
  const typeRaw = String(formData.get('type') ?? 'none');
  const type = typeRaw === 'fixed' || typeRaw === 'percent' ? typeRaw : 'none';
  const fixedPaise = Math.round(Number(formData.get('fixedInr') ?? 0) * 100);
  const percentBps = Math.round(Number(formData.get('percent') ?? 0) * 100);
  if (!employeeId) throw new Error('Missing employee');

  await updateCommissionDefaults({
    employeeId,
    type,
    fixedPaise,
    percentBps,
    actorEmployeeId: actorId,
  });
  revalidatePath('/workforce/operations');
}

export async function setPerformanceTargetAction(formData: FormData): Promise<void> {
  const actorId = await requireActor();
  if (!(await employeeHasPermission(actorId, 'fyh_salon', 'staff.edit'))) {
    throw new Error('Not allowed');
  }
  const employeeId = String(formData.get('employeeId') ?? '');
  const targetPaise = Math.round(Number(formData.get('targetInr') ?? 0) * 100);
  if (!employeeId) throw new Error('Missing employee');

  await updatePerformanceTarget({
    employeeId,
    targetPaise,
    actorEmployeeId: actorId,
  });
  revalidatePath('/workforce/operations');
}

export async function addIncentiveAction(formData: FormData): Promise<void> {
  const actorId = await requireActor();
  const canPay =
    (await employeeHasPermission(actorId, 'fyh_salon', 'staff.edit')) ||
    (await employeeHasPermission(actorId, 'fyh_salon', 'finance.view_salary'));
  if (!canPay) throw new Error('Not allowed');

  const employeeId = String(formData.get('employeeId') ?? '');
  const label = String(formData.get('label') ?? 'Incentive');
  const amountPaise = Math.round(Number(formData.get('amountInr') ?? 0) * 100);
  const effectiveDate = String(formData.get('effectiveDate') ?? new Date().toISOString().slice(0, 10));
  if (!employeeId || amountPaise <= 0) throw new Error('Invalid incentive');

  await createIncentive({
    employeeId,
    label,
    amountPaise,
    effectiveDate,
    createdByEmployeeId: actorId,
  });
  revalidatePath('/workforce/operations');
}
