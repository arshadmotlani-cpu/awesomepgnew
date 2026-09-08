'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { getSalonSettings } from '@/src/hair/services/settings';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import { persistAttendancePhotoFromFile } from '@/src/workforce/lib/persistAttendancePhoto';
import {
  ATTENDANCE_MANAGE_HREF,
  ATTENDANCE_MAP_HREF,
} from '@/src/workforce/lib/attendanceRoutes';
import {
  AttendanceError,
  correctAttendanceByOwner,
  getTodayAttendance,
  markPresentByOwner,
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

export async function requireTeamAttendanceAccess(): Promise<{
  session: NonNullable<Awaited<ReturnType<typeof getHairSession>>>;
  isSuperAdmin: boolean;
}> {
  const session = await getHairSession();
  if (!session) redirect('/login');

  const isSuperAdmin = session.admin.role === 'super_admin';
  if (!session.workforceEmployeeId && !isSuperAdmin) {
    redirect('/login');
  }

  const canView =
    isSuperAdmin ||
    (session.workforceEmployeeId
      ? await employeeHasPermission(
          session.workforceEmployeeId,
          'fyh_salon',
          'attendance.view_team',
        )
      : false);

  if (!canView) redirect('/attendance');

  return { session, isSuperAdmin };
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

export async function markPresentWithPhotoAction(formData: FormData): Promise<AttendanceActionState> {
  try {
    const employeeId = await requireSelfEmployeeId();
    await requireWorkforcePermission('attendance.mark');

    const photo = formData.get('photo');
    if (!(photo instanceof File) || photo.size === 0) {
      return { error: 'Camera access is required to mark attendance.' };
    }

    const latitude = Number(formData.get('latitude'));
    const longitude = Number(formData.get('longitude'));
    const accuracyRaw = formData.get('accuracyMetres');
    const accuracyMetres = accuracyRaw != null && accuracyRaw !== '' ? Number(accuracyRaw) : null;

    const photoUrl = await persistAttendancePhotoFromFile(photo);
    await markPresentWithGeolocation({
      employeeId,
      latitude,
      longitude,
      accuracyMetres,
      photoUrl,
    });

    revalidatePath('/attendance');
    revalidatePath('/me');
    return { success: 'Present marked successfully.' };
  } catch (e) {
    if (e instanceof AttendanceError) return { error: e.message };
    return { error: e instanceof Error ? e.message : 'Could not mark attendance.' };
  }
}

export async function markStaffPresentByOwnerAction(formData: FormData): Promise<AttendanceActionState> {
  try {
    const actorId = await requireSelfEmployeeId();
    await requireWorkforcePermission('attendance.correct');
    const employeeId = String(formData.get('employeeId') ?? '').trim();
    if (!employeeId) return { error: 'Select a staff member.' };

    await markPresentByOwner({
      employeeId,
      actorEmployeeId: actorId,
      reason: String(formData.get('reason') ?? 'Owner marked present').trim() || 'Owner marked present',
    });

    revalidatePath(ATTENDANCE_MANAGE_HREF);
    revalidatePath(ATTENDANCE_MAP_HREF);
    return { success: 'Staff marked present for today.' };
  } catch (e) {
    if (e instanceof AttendanceError) return { error: e.message };
    return { error: e instanceof Error ? e.message : 'Could not mark staff present.' };
  }
}

export async function saveOfficeLocationAction(
  _prev: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  try {
    await requireWorkforcePermission('attendance.manage_office');
    const ctx = await getTenantContextForPage();
    const latitude = Number(formData.get('officeLatitude'));
    const longitude = Number(formData.get('officeLongitude'));
    const officeLabel = String(formData.get('officeLabel') ?? '').trim() || null;
    const radiusRaw = formData.get('officeRadiusMetres');
    const officeRadiusMetres =
      radiusRaw != null && String(radiusRaw).trim() !== '' ? Number(radiusRaw) : undefined;
    await updateOfficeLocationConfig(
      {
        officeLatitude: latitude,
        officeLongitude: longitude,
        officeLabel,
        officeRadiusMetres,
      },
      ctx,
    );
    revalidatePath('/settings');
    revalidatePath('/settings/attendance');
    revalidatePath('/attendance');
    revalidatePath(ATTENDANCE_MANAGE_HREF);
    revalidatePath(ATTENDANCE_MAP_HREF);
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
    revalidatePath(ATTENDANCE_MANAGE_HREF);
    revalidatePath(ATTENDANCE_MAP_HREF);
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
  if (!session?.workforceEmployeeId) return session?.admin.role === 'super_admin';
  if (session.admin.role === 'super_admin') return true;
  return employeeHasPermission(session.workforceEmployeeId, 'fyh_salon', 'attendance.view_team');
}

export async function submitCorrectionForm(formData: FormData): Promise<void> {
  const result = await correctAttendanceAction({}, formData);
  if (result.error) throw new Error(result.error);
}

export async function submitOwnerMarkPresentForm(formData: FormData): Promise<void> {
  const result = await markStaffPresentByOwnerAction(formData);
  if (result.error) throw new Error(result.error);
}

export async function canViewStaffFinancials(): Promise<boolean> {
  const session = await getHairSession();
  if (!session?.workforceEmployeeId) return session?.admin.role === 'super_admin';
  if (session.admin.role === 'super_admin') return true;
  return employeeHasPermission(session.workforceEmployeeId, 'fyh_salon', 'staff.view_financials');
}

/** @deprecated Use canViewStaffFinancials — salary columns on attendance views. */
export async function canViewSalary(): Promise<boolean> {
  return canViewStaffFinancials();
}
