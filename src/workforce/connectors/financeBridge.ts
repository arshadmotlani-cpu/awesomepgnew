/**
 * Workforce → Finance Brain bridge (read + contribution events).
 * Finance Brain remains PLANNED; this is the Workforce-owned public surface it will subscribe to.
 * Does not write into PG / Capital finance tables.
 */
import { and, eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfEmployees, wfEngineMemberships, wfIncentives, wfPayrollRuns } from '@/src/workforce/db/schema';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';
import type { WorkforceEngineId } from '@/src/workforce/types';

export type WorkforceFinanceContribution = {
  engineId: WorkforceEngineId;
  activeEmployeeCount: number;
  monthlySalaryLiabilityPaise: number;
  pendingIncentivePaise: number;
  draftPayrollRunCount: number;
  asOf: string;
};

export async function getWorkforceFinanceContribution(
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<WorkforceFinanceContribution> {
  const [salaryAgg] = await hairDb
    .select({
      count: sql<number>`count(*)::int`,
      salary: sql<number>`coalesce(sum(${wfEmployees.salaryPaise}), 0)::bigint`,
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

  const [incentiveAgg] = await hairDb
    .select({
      amount: sql<number>`coalesce(sum(${wfIncentives.amountPaise}), 0)::bigint`,
    })
    .from(wfIncentives)
    .where(and(eq(wfIncentives.engineId, engineId), eq(wfIncentives.status, 'pending')));

  const [payrollAgg] = await hairDb
    .select({ count: sql<number>`count(*)::int` })
    .from(wfPayrollRuns)
    .where(and(eq(wfPayrollRuns.engineId, engineId), eq(wfPayrollRuns.status, 'draft')));

  return {
    engineId,
    activeEmployeeCount: Number(salaryAgg?.count ?? 0),
    monthlySalaryLiabilityPaise: Number(salaryAgg?.salary ?? 0),
    pendingIncentivePaise: Number(incentiveAgg?.amount ?? 0),
    draftPayrollRunCount: Number(payrollAgg?.count ?? 0),
    asOf: new Date().toISOString(),
  };
}

/** Emit a contribution snapshot event for Finance Brain subscribers. */
export async function publishWorkforceFinanceContribution(
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<WorkforceFinanceContribution> {
  const snapshot = await getWorkforceFinanceContribution(engineId);
  await publishEmployeeEvent({
    eventType: 'employee.finance.contribution',
    engineId,
    payload: { ...snapshot, brain: 'finance' },
    sourceRef: 'workforce.connectors.finance',
  });
  return snapshot;
}
