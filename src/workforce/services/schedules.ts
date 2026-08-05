import { and, asc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfSchedules } from '@/src/workforce/db/schema';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';
import type { WorkforceEngineId } from '@/src/workforce/types';

export type DayScheduleInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  lunchStart?: string | null;
  lunchEnd?: string | null;
  isOff?: boolean;
};

const DEFAULT_WEEK: DayScheduleInput[] = [
  { dayOfWeek: 0, startTime: '10:00', endTime: '19:00', isOff: true },
  { dayOfWeek: 1, startTime: '10:00', endTime: '19:00', isOff: false },
  { dayOfWeek: 2, startTime: '10:00', endTime: '19:00', isOff: false },
  { dayOfWeek: 3, startTime: '10:00', endTime: '19:00', isOff: false },
  { dayOfWeek: 4, startTime: '10:00', endTime: '19:00', isOff: false },
  { dayOfWeek: 5, startTime: '10:00', endTime: '19:00', isOff: false },
  { dayOfWeek: 6, startTime: '10:00', endTime: '19:00', isOff: false },
];

export function defaultWeeklySchedule(): DayScheduleInput[] {
  return DEFAULT_WEEK.map((d) => ({ ...d }));
}

/** True when local HH:MM falls inside the working window (exclusive of lunch). */
export function isWithinWorkingHours(
  schedule: { startTime: string; endTime: string; lunchStart?: string | null; lunchEnd?: string | null; isOff: boolean },
  hhmm: string,
): boolean {
  if (schedule.isOff) return false;
  if (hhmm < schedule.startTime || hhmm >= schedule.endTime) return false;
  if (schedule.lunchStart && schedule.lunchEnd) {
    if (hhmm >= schedule.lunchStart && hhmm < schedule.lunchEnd) return false;
  }
  return true;
}

export async function getEmployeeSchedule(
  employeeId: string,
  engineId: WorkforceEngineId = 'fyh_salon',
) {
  return hairDb
    .select()
    .from(wfSchedules)
    .where(and(eq(wfSchedules.employeeId, employeeId), eq(wfSchedules.engineId, engineId)))
    .orderBy(asc(wfSchedules.dayOfWeek));
}

export async function upsertEmployeeWeeklySchedule(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  days: DayScheduleInput[];
  actorEmployeeId?: string | null;
}): Promise<void> {
  const engineId = input.engineId ?? 'fyh_salon';
  for (const day of input.days) {
    if (day.dayOfWeek < 0 || day.dayOfWeek > 6) continue;
    const [existing] = await hairDb
      .select({ id: wfSchedules.id })
      .from(wfSchedules)
      .where(
        and(
          eq(wfSchedules.employeeId, input.employeeId),
          eq(wfSchedules.engineId, engineId),
          eq(wfSchedules.dayOfWeek, day.dayOfWeek),
        ),
      )
      .limit(1);

    const values = {
      startTime: day.startTime,
      endTime: day.endTime,
      lunchStart: day.lunchStart ?? null,
      lunchEnd: day.lunchEnd ?? null,
      isOff: Boolean(day.isOff),
      updatedAt: new Date(),
    };

    if (existing) {
      await hairDb.update(wfSchedules).set(values).where(eq(wfSchedules.id, existing.id));
    } else {
      await hairDb.insert(wfSchedules).values({
        employeeId: input.employeeId,
        engineId,
        dayOfWeek: day.dayOfWeek,
        ...values,
      });
    }
  }

  await publishEmployeeEvent({
    eventType: 'employee.schedule.updated',
    employeeId: input.employeeId,
    engineId,
    payload: { days: input.days.length, actorEmployeeId: input.actorEmployeeId ?? null },
  });
}
