'use server';

import { revalidatePath } from 'next/cache';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { getSalonSettings } from '@/src/hair/services/settings';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import {
  AttendanceError,
  correctAttendanceByOwner,
  getTodayAttendance,
  markPresentWithGeolocation,
  type AttendanceStatus,
} from '@/src/workforce/services/attendance';
import { buildStaffMonthAttendanceSummary } from '@/src/workforce/services/attendancePayroll';
import { updateOfficeLocationConfig } from '@/src/workforce/services/officeLocation';
import { requireWorkforcePermission } from '@/src/workforce/permissions/guards';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

export type AttendanceActionState = { error?: string; success?: string };

async function requireSelfEmployeeId(): Promise<string> {
  if (!isWorkforceEngineEnabled()) throw new Error('Workforce Engine is not enabled');
  const session = await getHairSession();
  if (!session?.workforceEmployeeId) throw new Error('Not signed in');
  return session.workforceEmployeeId;
}

export async function markPresentAction(input: {
  latitude: number;
  longitude: number;
  accuracyMetres?: number | null;
}): Promise<AttendanceActionState> {
  try {
    const employeeId = await requireSelfEmployeeId();
    await requireWorkforcePermission('attendance.mark');
    await markPresentWithGeolocation({
      employeeId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMetres: input.accuracyMetres,
    });
    revalidatePath('/attendance');
    revalidatePath('/me');
    return { success: 'Present marked successfully.' };
  } catch (e) {
    if (e instanceof AttendanceError) return { error: e.message };
    return { error: e instanceof Error ? e.message : 'Could not mark attendance.' };
  }
}

export async function saveOfficeLocationAction(
  _prev: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  try {
    await requireWorkforcePermission('attendance.manage_office');
    const latitude = Number(formData.get('officeLatitude'));
    const longitude = Number(formData.get('officeLongitude'));
    const officeLabel = String(formData.get('officeLabel') ?? '').trim() || null;
    await updateOfficeLocationConfig({ officeLatitude: latitude, officeLongitude: longitude, officeLabel });
    revalidatePath('/settings');
    revalidatePath('/attendance');
    revalidatePath('/attendance/manage');
    return { success: 'Office location saved.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save office location.' };
  }
}

export async function correctAttendanceAction(
  _prev: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  try {
    const actorId = await requireSelfEmployeeId();
    await requireWorkforcePermission('attendance.correct');
    const employeeId = String(formData.get('employeeId') ?? '').trim();
    const workDate = String(formData.get('workDate') ?? '').trim();
    const status = String(formData.get('status') ?? '').trim() as AttendanceStatus;
    const reason = String(formData.get('reason') ?? '').trim();
    if (!employeeId || !workDate) return { error: 'Missing employee or date.' };
    await correctAttendanceByOwner({
      employeeId,
      workDate,
      status,
      reason,
      actorEmployeeId: actorId,
    });
    revalidatePath('/attendance/manage');
    return { success: 'Attendance corrected.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not correct attendance.' };
  }
}

export async function loadOwnAttendancePageData() {
  const employeeId = await requireSelfEmployeeId();
  await requireWorkforcePermission('attendance.view_own');
  const settings = await getSalonSettings();
  const timezone = settings.timezone ?? 'Asia/Kolkata';
  const today = await getTodayAttendance({ employeeId, timezone });
  const month = await buildStaffMonthAttendanceSummary({ employeeId });
  const office = await import('@/src/workforce/services/officeLocation').then((m) =>
    m.getOfficeLocationConfig(),
  );
  return { today, month, timezone, officeConfigured: office.configured };
}

export async function canViewTeamAttendance(): Promise<boolean> {
  const session = await getHairSession();
  if (!session?.workforceEmployeeId) return false;
  return employeeHasPermission(session.workforceEmployeeId, 'fyh_salon', 'attendance.view_team');
}

export async function submitCorrectionForm(formData: FormData): Promise<void> {
  const result = await correctAttendanceAction({}, formData);
  if (result.error) throw new Error(result.error);
}

export async function canViewSalary(): Promise<boolean> {
  const session = await getHairSession();
  if (!session?.workforceEmployeeId) return false;
  return employeeHasPermission(session.workforceEmployeeId, 'fyh_salon', 'finance.view_salary');
}
