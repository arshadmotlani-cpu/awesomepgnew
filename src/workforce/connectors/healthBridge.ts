/**
 * Workforce → Health Brain readiness bridge (READ-ONLY from Workforce).
 *
 * Platform Baseline v1 freezes Health Brain — this module does NOT import or mutate
 * Health Brain / Repair Engine. It publishes Workforce self-integrity that Health
 * Brain may subscribe to later without Workforce writing into brain_* tables.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  wfAttendance,
  wfEmployees,
  wfEngineMemberships,
  wfSchedules,
} from '@/src/workforce/db/schema';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';
import type { WorkforceEngineId } from '@/src/workforce/types';

export type WorkforceHealthSelfCheck = {
  engineId: WorkforceEngineId;
  status: 'healthy' | 'attention';
  activeEmployees: number;
  employeesMissingSchedule: number;
  attendanceRowsLast7Days: number;
  notes: string[];
  asOf: string;
};

export async function getWorkforceHealthSelfCheck(
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<WorkforceHealthSelfCheck> {
  const members = await hairDb
    .select({
      employeeId: wfEngineMemberships.employeeId,
      fullName: wfEmployees.fullName,
    })
    .from(wfEngineMemberships)
    .innerJoin(wfEmployees, eq(wfEmployees.id, wfEngineMemberships.employeeId))
    .where(
      and(
        eq(wfEngineMemberships.engineId, engineId),
        eq(wfEngineMemberships.isActive, true),
        eq(wfEmployees.status, 'active'),
      ),
    );

  let missingSchedule = 0;
  for (const m of members) {
    const [row] = await hairDb
      .select({ c: sql<number>`count(*)::int` })
      .from(wfSchedules)
      .where(and(eq(wfSchedules.employeeId, m.employeeId), eq(wfSchedules.engineId, engineId)));
    if (Number(row?.c ?? 0) === 0) missingSchedule += 1;
  }

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);
  const sinceDate = since.toISOString().slice(0, 10);
  const [att] = await hairDb
    .select({ c: sql<number>`count(*)::int` })
    .from(wfAttendance)
    .where(and(eq(wfAttendance.engineId, engineId), gte(wfAttendance.workDate, sinceDate)));

  const notes: string[] = [];
  if (missingSchedule > 0) {
    notes.push(`${missingSchedule} active employee(s) have no working hours set`);
  }
  if (members.length === 0) {
    notes.push('No active Workforce employees for this engine');
  }

  return {
    engineId,
    status: notes.length === 0 ? 'healthy' : 'attention',
    activeEmployees: members.length,
    employeesMissingSchedule: missingSchedule,
    attendanceRowsLast7Days: Number(att?.c ?? 0),
    notes,
    asOf: new Date().toISOString(),
  };
}

export async function publishWorkforceHealthSelfCheck(
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<WorkforceHealthSelfCheck> {
  const snapshot = await getWorkforceHealthSelfCheck(engineId);
  await publishEmployeeEvent({
    eventType: 'employee.health.self_check',
    engineId,
    payload: { ...snapshot, brain: 'health', mutatesHealthBrain: false },
    sourceRef: 'workforce.connectors.health',
  });
  return snapshot;
}
