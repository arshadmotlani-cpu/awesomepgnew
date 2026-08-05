/**
 * Appointment Brain bridge — Workforce owns who can take bookings + hours.
 * Does not own salon appointment records (fyh_appointments); Appointment Brain does.
 */
import { listEmployeesForEngine } from '@/src/workforce/brains/employeeBrain';
import {
  getEmployeeSchedule,
  isWithinWorkingHours,
  type DayScheduleInput,
} from '@/src/workforce/services/schedules';
import type { WorkforceEngineId } from '@/src/workforce/types';

export type BookableEmployee = {
  employeeId: string;
  fullName: string;
  mobile: string | null;
  jobRole: string;
  performanceTargetPaise: number;
};

export async function listBookableEmployees(
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<BookableEmployee[]> {
  const rows = await listEmployeesForEngine(engineId, {
    activeOnly: true,
    receiveBookingsOnly: true,
  });
  return rows.map((r) => ({
    employeeId: r.employee.id,
    fullName: r.employee.fullName,
    mobile: r.employee.mobile,
    jobRole: r.membership.jobRole,
    performanceTargetPaise: r.membership.performanceTargetPaise,
  }));
}

export async function getWorkingHoursForDay(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  dayOfWeek: number;
}): Promise<DayScheduleInput | null> {
  const schedule = await getEmployeeSchedule(input.employeeId, input.engineId ?? 'fyh_salon');
  const day = schedule.find((s) => s.dayOfWeek === input.dayOfWeek);
  if (!day) return null;
  return {
    dayOfWeek: day.dayOfWeek,
    startTime: day.startTime,
    endTime: day.endTime,
    lunchStart: day.lunchStart,
    lunchEnd: day.lunchEnd,
    isOff: day.isOff,
  };
}

/** Whether an employee is scheduled to work at local HH:MM on dayOfWeek. */
export async function employeeAvailableAt(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  dayOfWeek: number;
  hhmm: string;
}): Promise<boolean> {
  const day = await getWorkingHoursForDay(input);
  if (!day) return false;
  return isWithinWorkingHours(
    {
      startTime: day.startTime,
      endTime: day.endTime,
      lunchStart: day.lunchStart,
      lunchEnd: day.lunchEnd,
      isOff: Boolean(day.isOff),
    },
    input.hhmm,
  );
}
