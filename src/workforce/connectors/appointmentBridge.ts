/**
 * Workforce → Appointment Brain bridge.
 * Appointment Brain owns visit records; Workforce owns roster + hours.
 */
export {
  employeeAvailableAt,
  getWorkingHoursForDay,
  listBookableEmployees,
  type BookableEmployee,
} from '@/src/workforce/services/appointmentsBridge';

import { listBookableEmployees } from '@/src/workforce/services/appointmentsBridge';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';
import type { WorkforceEngineId } from '@/src/workforce/types';

export type AppointmentBrainRosterSnapshot = {
  engineId: WorkforceEngineId;
  bookableCount: number;
  employeeIds: string[];
  asOf: string;
};

export async function getAppointmentBrainRoster(
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<AppointmentBrainRosterSnapshot> {
  const rows = await listBookableEmployees(engineId);
  return {
    engineId,
    bookableCount: rows.length,
    employeeIds: rows.map((r) => r.employeeId),
    asOf: new Date().toISOString(),
  };
}

export async function publishAppointmentRosterRefresh(
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<AppointmentBrainRosterSnapshot> {
  const snapshot = await getAppointmentBrainRoster(engineId);
  await publishEmployeeEvent({
    eventType: 'employee.appointment.roster_refreshed',
    engineId,
    payload: { ...snapshot, brain: 'appointment' },
    sourceRef: 'workforce.connectors.appointment',
  });
  return snapshot;
}
