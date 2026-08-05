import { hairDb } from '@/src/hair/db/client';
import { wfEvents } from '@/src/workforce/db/schema';
import type { WorkforceEngineId } from '@/src/workforce/types';

export const EMPLOYEE_EVENT_TYPES = [
  'employee.created',
  'employee.updated',
  'employee.role.changed',
  'employee.salary.changed',
  'employee.permission.changed',
  'employee.login',
  'employee.logout',
  'employee.deleted',
  'employee.schedule.updated',
  'employee.attendance.clock_in',
  'employee.attendance.clock_out',
  'employee.commission.changed',
  'employee.performance.target_changed',
  'employee.incentive.created',
] as const;

export type EmployeeEventType = (typeof EMPLOYEE_EVENT_TYPES)[number];

export async function publishEmployeeEvent(input: {
  eventType: EmployeeEventType;
  employeeId?: string | null;
  engineId?: WorkforceEngineId | null;
  payload?: Record<string, unknown>;
  sourceRef?: string;
}): Promise<void> {
  await hairDb.insert(wfEvents).values({
    eventType: input.eventType,
    employeeId: input.employeeId ?? null,
    engineId: input.engineId ?? null,
    payload: input.payload ?? {},
    sourceRef: input.sourceRef ?? 'workforce',
  });
}
