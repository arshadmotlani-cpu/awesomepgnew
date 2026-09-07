import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { getSalonSettings } from '@/src/hair/services/settings';
import { wfAttendance, wfAttendanceCorrections } from '@/src/workforce/db/schema';
import { canonicalBusinessDate } from '@/src/workforce/lib/attendanceBusinessDate';
import {
  distanceMetres,
  isPlausibleGpsReading,
  isSuspiciouslyInaccurateGps,
  isWithinRadiusMetres,
} from '@/src/workforce/lib/geoDistance';
import { requireConfiguredOfficeLocation } from '@/src/workforce/services/officeLocation';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';
import type { WorkforceEngineId } from '@/src/workforce/types';

export const ATTENDANCE_STATUSES = [
  'present',
  'absent',
  'late',
  'half_day',
  'leave',
  'holiday',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export class AttendanceError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'outside_radius'
      | 'location_required'
      | 'already_marked'
      | 'invalid_date'
      | 'office_not_configured'
      | 'gps_inaccurate'
      | 'locked'
      | 'not_allowed',
  ) {
    super(message);
    this.name = 'AttendanceError';
  }
}

export async function listAttendance(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}) {
  const engineId = input.engineId ?? 'fyh_salon';
  const conditions = [
    eq(wfAttendance.employeeId, input.employeeId),
    eq(wfAttendance.engineId, engineId),
  ];
  if (input.fromDate) conditions.push(gte(wfAttendance.workDate, input.fromDate));
  if (input.toDate) conditions.push(lte(wfAttendance.workDate, input.toDate));

  return hairDb
    .select()
    .from(wfAttendance)
    .where(and(...conditions))
    .orderBy(desc(wfAttendance.workDate))
    .limit(input.limit ?? 31);
}

export async function listAttendanceForEmployees(input: {
  employeeIds: string[];
  engineId?: WorkforceEngineId;
  fromDate: string;
  toDate: string;
}) {
  if (input.employeeIds.length === 0) return [];
  const engineId = input.engineId ?? 'fyh_salon';
  return hairDb
    .select()
    .from(wfAttendance)
    .where(
      and(
        inArray(wfAttendance.employeeId, input.employeeIds),
        eq(wfAttendance.engineId, engineId),
        gte(wfAttendance.workDate, input.fromDate),
        lte(wfAttendance.workDate, input.toDate),
      ),
    )
    .orderBy(desc(wfAttendance.workDate));
}

export async function getTodayAttendance(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  timezone?: string;
  now?: Date;
}) {
  const settings = await getSalonSettings();
  const timezone = input.timezone ?? settings.timezone ?? 'Asia/Kolkata';
  const workDate = canonicalBusinessDate(timezone, input.now);
  const rows = await listAttendance({
    employeeId: input.employeeId,
    engineId: input.engineId,
    fromDate: workDate,
    toDate: workDate,
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function markPresentWithGeolocation(input: {
  employeeId: string;
  latitude: number;
  longitude: number;
  accuracyMetres?: number | null;
  engineId?: WorkforceEngineId;
  now?: Date;
}): Promise<typeof wfAttendance.$inferSelect> {
  const settings = await getSalonSettings();
  const timezone = settings.timezone ?? 'Asia/Kolkata';
  const now = input.now ?? new Date();
  const workDate = canonicalBusinessDate(timezone, now);

  if (
    !isPlausibleGpsReading({
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMetres: input.accuracyMetres,
    })
  ) {
    throw new AttendanceError(
      'Location access is required to mark attendance. Please allow location access and try again.',
      'location_required',
    );
  }

  if (isSuspiciouslyInaccurateGps(input.accuracyMetres)) {
    throw new AttendanceError(
      'GPS reading is too inaccurate. Move to an open area and try again.',
      'gps_inaccurate',
    );
  }

  let office;
  try {
    office = await requireConfiguredOfficeLocation();
  } catch {
    throw new AttendanceError(
      'Office location is not configured. Ask your owner to set it in Settings.',
      'office_not_configured',
    );
  }

  const distance = Math.round(
    distanceMetres(
      input.latitude,
      input.longitude,
      office.officeLatitude!,
      office.officeLongitude!,
    ),
  );

  if (
    !isWithinRadiusMetres(
      input.latitude,
      input.longitude,
      office.officeLatitude!,
      office.officeLongitude!,
      office.officeRadiusMetres,
      input.accuracyMetres,
    )
  ) {
    throw new AttendanceError(
      'You are not at the office location. Please reach your office and try again.',
      'outside_radius',
    );
  }

  const engineId = input.engineId ?? 'fyh_salon';

  const [existing] = await hairDb
    .select()
    .from(wfAttendance)
    .where(
      and(
        eq(wfAttendance.employeeId, input.employeeId),
        eq(wfAttendance.engineId, engineId),
        eq(wfAttendance.workDate, workDate),
      ),
    )
    .limit(1);

  if (existing?.lockedAt || existing?.clockInAt) {
    throw new AttendanceError('Attendance is already marked for today.', 'already_marked');
  }

  const values = {
    clockInAt: now,
    status: 'present' as const,
    clockInLatitude: input.latitude,
    clockInLongitude: input.longitude,
    gpsAccuracyMetres: input.accuracyMetres != null ? Math.round(input.accuracyMetres) : null,
    distanceMetres: distance,
    lockedAt: now,
  };

  let row: typeof wfAttendance.$inferSelect;
  if (existing) {
    const [updated] = await hairDb
      .update(wfAttendance)
      .set(values)
      .where(eq(wfAttendance.id, existing.id))
      .returning();
    row = updated!;
  } else {
    const [created] = await hairDb
      .insert(wfAttendance)
      .values({
        employeeId: input.employeeId,
        engineId,
        workDate,
        ...values,
      })
      .returning();
    row = created!;
  }

  await publishEmployeeEvent({
    eventType: 'employee.attendance.clock_in',
    employeeId: input.employeeId,
    engineId,
    payload: { workDate, attendanceId: row.id, distanceMetres: distance },
  });

  return row;
}

export async function clockIn(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  workDate?: string;
  at?: Date;
}): Promise<typeof wfAttendance.$inferSelect> {
  throw new AttendanceError(
    'Use the Attendance page to mark present with location verification.',
    'not_allowed',
  );
}

export async function clockOut(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  workDate?: string;
  at?: Date;
}): Promise<typeof wfAttendance.$inferSelect | null> {
  const settings = await getSalonSettings();
  const timezone = settings.timezone ?? 'Asia/Kolkata';
  const at = input.at ?? new Date();
  const workDate = input.workDate ?? canonicalBusinessDate(timezone, at);
  const engineId = input.engineId ?? 'fyh_salon';

  const [existing] = await hairDb
    .select()
    .from(wfAttendance)
    .where(
      and(
        eq(wfAttendance.employeeId, input.employeeId),
        eq(wfAttendance.engineId, engineId),
        eq(wfAttendance.workDate, workDate),
      ),
    )
    .limit(1);

  if (!existing?.clockInAt) return null;

  const [updated] = await hairDb
    .update(wfAttendance)
    .set({ clockOutAt: at })
    .where(eq(wfAttendance.id, existing.id))
    .returning();

  await publishEmployeeEvent({
    eventType: 'employee.attendance.clock_out',
    employeeId: input.employeeId,
    engineId,
    payload: { workDate, attendanceId: updated!.id },
  });
  return updated!;
}

export async function markAttendanceStatus(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  workDate: string;
  status: AttendanceStatus;
  notes?: string | null;
  actorEmployeeId?: string | null;
  correctionReason?: string | null;
}): Promise<typeof wfAttendance.$inferSelect> {
  const engineId = input.engineId ?? 'fyh_salon';
  const [existing] = await hairDb
    .select()
    .from(wfAttendance)
    .where(
      and(
        eq(wfAttendance.employeeId, input.employeeId),
        eq(wfAttendance.engineId, engineId),
        eq(wfAttendance.workDate, input.workDate),
      ),
    )
    .limit(1);

  if (existing && input.correctionReason) {
    const [updated] = await hairDb
      .update(wfAttendance)
      .set({
        status: input.status,
        notes: input.notes ?? existing.notes,
        lockedAt: existing.lockedAt ?? new Date(),
      })
      .where(eq(wfAttendance.id, existing.id))
      .returning();

    await hairDb.insert(wfAttendanceCorrections).values({
      attendanceId: existing.id,
      employeeId: input.employeeId,
      workDate: input.workDate,
      previousStatus: existing.status,
      newStatus: input.status,
      reason: input.correctionReason,
      correctedByEmployeeId: input.actorEmployeeId ?? null,
    });

    return updated!;
  }

  if (existing) {
    const [updated] = await hairDb
      .update(wfAttendance)
      .set({ status: input.status, notes: input.notes ?? existing.notes })
      .where(eq(wfAttendance.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await hairDb
    .insert(wfAttendance)
    .values({
      employeeId: input.employeeId,
      engineId,
      workDate: input.workDate,
      status: input.status,
      notes: input.notes ?? null,
      lockedAt: input.status === 'present' ? new Date() : null,
    })
    .returning();
  return created!;
}

export async function correctAttendanceByOwner(input: {
  employeeId: string;
  workDate: string;
  status: AttendanceStatus;
  reason: string;
  actorEmployeeId: string;
  engineId?: WorkforceEngineId;
  notes?: string | null;
}): Promise<typeof wfAttendance.$inferSelect> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error('Correction reason is required.');
  return markAttendanceStatus({
    employeeId: input.employeeId,
    engineId: input.engineId,
    workDate: input.workDate,
    status: input.status,
    notes: input.notes,
    actorEmployeeId: input.actorEmployeeId,
    correctionReason: reason,
  });
}
