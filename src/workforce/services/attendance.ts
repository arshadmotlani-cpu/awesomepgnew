import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfAttendance } from '@/src/workforce/db/schema';
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

function todayIsoDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
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

export async function clockIn(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  workDate?: string;
  at?: Date;
}): Promise<typeof wfAttendance.$inferSelect> {
  const engineId = input.engineId ?? 'fyh_salon';
  const workDate = input.workDate ?? todayIsoDate(input.at);
  const at = input.at ?? new Date();

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

  if (existing?.clockInAt) return existing;

  if (existing) {
    const [updated] = await hairDb
      .update(wfAttendance)
      .set({ clockInAt: at, status: existing.status === 'absent' ? 'present' : existing.status })
      .where(eq(wfAttendance.id, existing.id))
      .returning();
    await publishEmployeeEvent({
      eventType: 'employee.attendance.clock_in',
      employeeId: input.employeeId,
      engineId,
      payload: { workDate, attendanceId: updated.id },
    });
    return updated;
  }

  const [created] = await hairDb
    .insert(wfAttendance)
    .values({
      employeeId: input.employeeId,
      engineId,
      workDate,
      clockInAt: at,
      status: 'present',
    })
    .returning();

  await publishEmployeeEvent({
    eventType: 'employee.attendance.clock_in',
    employeeId: input.employeeId,
    engineId,
    payload: { workDate, attendanceId: created.id },
  });
  return created;
}

export async function clockOut(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  workDate?: string;
  at?: Date;
}): Promise<typeof wfAttendance.$inferSelect | null> {
  const engineId = input.engineId ?? 'fyh_salon';
  const workDate = input.workDate ?? todayIsoDate(input.at);
  const at = input.at ?? new Date();

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

  if (!existing) return null;

  const [updated] = await hairDb
    .update(wfAttendance)
    .set({ clockOutAt: at })
    .where(eq(wfAttendance.id, existing.id))
    .returning();

  await publishEmployeeEvent({
    eventType: 'employee.attendance.clock_out',
    employeeId: input.employeeId,
    engineId,
    payload: { workDate, attendanceId: updated.id },
  });
  return updated;
}

export async function markAttendanceStatus(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  workDate: string;
  status: AttendanceStatus;
  notes?: string | null;
  actorEmployeeId?: string | null;
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

  if (existing) {
    const [updated] = await hairDb
      .update(wfAttendance)
      .set({ status: input.status, notes: input.notes ?? existing.notes })
      .where(eq(wfAttendance.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await hairDb
    .insert(wfAttendance)
    .values({
      employeeId: input.employeeId,
      engineId,
      workDate: input.workDate,
      status: input.status,
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}
