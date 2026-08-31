import { and, asc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { saveStaffDaySchedule, type StaffScheduleTenantScope } from '@/src/hair/services/staffSchedules';
import { wfSchedules } from '@/src/workforce/db/schema';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';
import type { WorkforceEngineId } from '@/src/workforce/types';
import { DEFAULT_WEEK_SCHEDULE, type DayScheduleInput } from '@/src/workforce/lib/weekOff';

export type { DayScheduleInput } from '@/src/workforce/lib/weekOff';

type HairDbClient = typeof hairDb;

export function defaultWeeklySchedule(): DayScheduleInput[] {
  return DEFAULT_WEEK_SCHEDULE.map((d) => ({ ...d }));
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
  organizationId?: string;
  locationId?: string | null;
  tx?: HairDbClient;
  /** Skip legacy mirror + event publish (e.g. when called inside a wider transaction). */
  deferSideEffects?: boolean;
}): Promise<void> {
  const engineId = input.engineId ?? 'fyh_salon';
  const db = input.tx ?? hairDb;
  const tenantCols = {
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input.locationId ? { locationId: input.locationId } : {}),
  };

  for (const day of input.days) {
    if (day.dayOfWeek < 0 || day.dayOfWeek > 6) continue;
    const [existing] = await db
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
      await db.update(wfSchedules).set(values).where(eq(wfSchedules.id, existing.id));
    } else {
      await db.insert(wfSchedules).values({
        employeeId: input.employeeId,
        engineId,
        dayOfWeek: day.dayOfWeek,
        ...tenantCols,
        ...values,
      });
    }
  }

  if (input.deferSideEffects) return;

  const tenant =
    input.organizationId && input.locationId
      ? { organizationId: input.organizationId, locationId: input.locationId }
      : null;
  await mirrorWeeklyScheduleToLegacyStaffSchedules(input.employeeId, input.days, tenant);

  await publishEmployeeEvent({
    eventType: 'employee.schedule.updated',
    employeeId: input.employeeId,
    engineId,
    payload: { days: input.days.length, actorEmployeeId: input.actorEmployeeId ?? null },
  });
}

export async function mirrorWeeklyScheduleToLegacyStaffSchedules(
  employeeId: string,
  days: DayScheduleInput[],
  tenant?: StaffScheduleTenantScope | null,
): Promise<void> {
  for (const day of days) {
    await saveStaffDaySchedule(
      {
        staffId: employeeId,
        dayOfWeek: day.dayOfWeek,
        startTime: day.startTime,
        endTime: day.endTime,
        isOff: Boolean(day.isOff),
      },
      null,
      tenant,
    );
  }
}
