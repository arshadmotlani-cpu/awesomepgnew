'use server';

import { revalidatePath } from 'next/cache';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import { clockIn, clockOut } from '@/src/workforce/services/attendance';
import { createIncentive, updateCommissionDefaults, updatePerformanceTarget } from '@/src/workforce/services/compensation';
import { defaultWeeklySchedule, upsertEmployeeWeeklySchedule } from '@/src/workforce/services/schedules';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

async function requireActor() {
  if (!isWorkforceEngineEnabled()) throw new Error('Workforce Engine is not enabled');
  const session = await getHairSession();
  if (!session?.workforceEmployeeId) throw new Error('Not signed in');
  return session.workforceEmployeeId;
}

export async function clockInAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const employeeId = await requireActor();
    await clockIn({ employeeId });
    revalidatePath('/me');
    revalidatePath('/workforce/operations');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Clock-in failed' };
  }
}

export async function clockOutAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const employeeId = await requireActor();
    await clockOut({ employeeId });
    revalidatePath('/me');
    revalidatePath('/workforce/operations');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Clock-out failed' };
  }
}

export async function seedDefaultScheduleAction(
  employeeId: string,
  _formData?: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const actorId = await requireActor();
    const canEdit =
      actorId === employeeId ||
      (await employeeHasPermission(actorId, 'fyh_salon', 'staff.edit'));
    if (!canEdit) return { ok: false, error: 'Not allowed' };

    await upsertEmployeeWeeklySchedule({
      employeeId,
      days: defaultWeeklySchedule(),
      actorEmployeeId: actorId,
    });
    revalidatePath('/workforce/operations');
    revalidatePath('/me');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Schedule update failed' };
  }
}

export async function saveWeeklyScheduleAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const actorId = await requireActor();
    const employeeId = String(formData.get('employeeId') ?? '');
    if (!employeeId) return { ok: false, error: 'Missing employee' };
    const canEdit =
      actorId === employeeId ||
      (await employeeHasPermission(actorId, 'fyh_salon', 'staff.edit'));
    if (!canEdit) return { ok: false, error: 'Not allowed' };

    const days = [];
    for (let dow = 0; dow <= 6; dow++) {
      days.push({
        dayOfWeek: dow,
        startTime: String(formData.get(`day_${dow}_start`) ?? '10:00'),
        endTime: String(formData.get(`day_${dow}_end`) ?? '19:00'),
        isOff: formData.get(`day_${dow}_off`) === '1',
      });
    }
    await upsertEmployeeWeeklySchedule({
      employeeId,
      days,
      actorEmployeeId: actorId,
    });
    revalidatePath('/workforce/operations');
    revalidatePath('/me');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Schedule save failed' };
  }
}

export async function setCommissionAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const actorId = await requireActor();
    if (!(await employeeHasPermission(actorId, 'fyh_salon', 'staff.edit'))) {
      return { ok: false, error: 'Not allowed' };
    }
    const employeeId = String(formData.get('employeeId') ?? '');
    const typeRaw = String(formData.get('type') ?? 'none');
    const type = typeRaw === 'fixed' || typeRaw === 'percent' ? typeRaw : 'none';
    const fixedPaise = Math.round(Number(formData.get('fixedInr') ?? 0) * 100);
    const percentBps = Math.round(Number(formData.get('percent') ?? 0) * 100);
    if (!employeeId) return { ok: false, error: 'Missing employee' };

    await updateCommissionDefaults({
      employeeId,
      type,
      fixedPaise,
      percentBps,
      actorEmployeeId: actorId,
    });
    revalidatePath('/workforce/operations');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Commission update failed' };
  }
}

export async function setPerformanceTargetAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const actorId = await requireActor();
    if (!(await employeeHasPermission(actorId, 'fyh_salon', 'staff.edit'))) {
      return { ok: false, error: 'Not allowed' };
    }
    const employeeId = String(formData.get('employeeId') ?? '');
    const targetPaise = Math.round(Number(formData.get('targetInr') ?? 0) * 100);
    if (!employeeId) return { ok: false, error: 'Missing employee' };

    await updatePerformanceTarget({
      employeeId,
      targetPaise,
      actorEmployeeId: actorId,
    });
    revalidatePath('/workforce/operations');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Target update failed' };
  }
}

export async function addIncentiveAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const actorId = await requireActor();
    const canPay =
      (await employeeHasPermission(actorId, 'fyh_salon', 'staff.edit')) ||
      (await employeeHasPermission(actorId, 'fyh_salon', 'finance.view_salary'));
    if (!canPay) return { ok: false, error: 'Not allowed' };

    const employeeId = String(formData.get('employeeId') ?? '');
    const label = String(formData.get('label') ?? 'Incentive');
    const amountPaise = Math.round(Number(formData.get('amountInr') ?? 0) * 100);
    const effectiveDate = String(formData.get('effectiveDate') ?? new Date().toISOString().slice(0, 10));
    if (!employeeId || amountPaise <= 0) return { ok: false, error: 'Invalid incentive' };

    await createIncentive({
      employeeId,
      label,
      amountPaise,
      effectiveDate,
      createdByEmployeeId: actorId,
    });
    revalidatePath('/workforce/operations');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Incentive create failed' };
  }
}
