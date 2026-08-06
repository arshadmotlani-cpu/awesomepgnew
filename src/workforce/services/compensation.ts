import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  wfEmployees,
  wfEngineMemberships,
  wfIncentives,
  wfPayrollLines,
  wfPayrollRuns,
} from '@/src/workforce/db/schema';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';
import {
  normalizeCommissionType,
  payrollNetPaise,
  type CommissionConfig,
} from '@/src/workforce/lib/compensationMath';
import {
  isEmployeeEligibleForPeriod,
  isPayrollGenerationWindowOpen,
  resolvePreviousMonthPeriod,
} from '@/src/workforce/lib/payrollPeriod';
import type { WorkforceEngineId } from '@/src/workforce/types';

export type CompensationSnapshot = {
  employeeId: string;
  salaryPaise: number;
  commission: CommissionConfig;
  performanceTargetPaise: number;
  upiId: string | null;
};

export async function getCompensationSnapshot(
  employeeId: string,
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<CompensationSnapshot | null> {
  const [row] = await hairDb
    .select({
      employee: wfEmployees,
      membership: wfEngineMemberships,
    })
    .from(wfEmployees)
    .innerJoin(
      wfEngineMemberships,
      and(
        eq(wfEngineMemberships.employeeId, wfEmployees.id),
        eq(wfEngineMemberships.engineId, engineId),
      ),
    )
    .where(eq(wfEmployees.id, employeeId))
    .limit(1);

  if (!row) return null;

  return {
    employeeId,
    salaryPaise: row.employee.salaryPaise,
    commission: {
      type: normalizeCommissionType(row.membership.defaultCommissionType),
      fixedPaise: row.membership.defaultCommissionFixedPaise,
      percentBps: row.membership.defaultCommissionPercentBps,
    },
    performanceTargetPaise: row.membership.performanceTargetPaise,
    upiId: row.employee.upiId,
  };
}

export async function updateCommissionDefaults(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  type: CommissionConfig['type'];
  fixedPaise?: number;
  percentBps?: number;
  actorEmployeeId?: string | null;
}): Promise<void> {
  const engineId = input.engineId ?? 'fyh_salon';
  await hairDb
    .update(wfEngineMemberships)
    .set({
      defaultCommissionType: input.type,
      defaultCommissionFixedPaise: Math.max(0, Math.floor(input.fixedPaise ?? 0)),
      defaultCommissionPercentBps: Math.max(0, Math.floor(input.percentBps ?? 0)),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(wfEngineMemberships.employeeId, input.employeeId),
        eq(wfEngineMemberships.engineId, engineId),
      ),
    );

  await publishEmployeeEvent({
    eventType: 'employee.commission.changed',
    employeeId: input.employeeId,
    engineId,
    payload: {
      type: input.type,
      fixedPaise: input.fixedPaise ?? 0,
      percentBps: input.percentBps ?? 0,
      actorEmployeeId: input.actorEmployeeId ?? null,
    },
  });
}

export async function updatePerformanceTarget(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  targetPaise: number;
  actorEmployeeId?: string | null;
}): Promise<void> {
  const engineId = input.engineId ?? 'fyh_salon';
  await hairDb
    .update(wfEngineMemberships)
    .set({
      performanceTargetPaise: Math.max(0, Math.floor(input.targetPaise)),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(wfEngineMemberships.employeeId, input.employeeId),
        eq(wfEngineMemberships.engineId, engineId),
      ),
    );

  await publishEmployeeEvent({
    eventType: 'employee.performance.target_changed',
    employeeId: input.employeeId,
    engineId,
    payload: {
      targetPaise: input.targetPaise,
      actorEmployeeId: input.actorEmployeeId ?? null,
    },
  });
}

export async function createIncentive(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  label: string;
  amountPaise: number;
  effectiveDate: string;
  notes?: string | null;
  createdByEmployeeId?: string | null;
}) {
  const engineId = input.engineId ?? 'fyh_salon';
  const [row] = await hairDb
    .insert(wfIncentives)
    .values({
      employeeId: input.employeeId,
      engineId,
      label: input.label.trim() || 'Incentive',
      amountPaise: Math.max(0, Math.floor(input.amountPaise)),
      effectiveDate: input.effectiveDate,
      status: 'pending',
      notes: input.notes ?? null,
      createdByEmployeeId: input.createdByEmployeeId ?? null,
    })
    .returning();

  await publishEmployeeEvent({
    eventType: 'employee.incentive.created',
    employeeId: input.employeeId,
    engineId,
    payload: { incentiveId: row.id, amountPaise: row.amountPaise, label: row.label },
  });
  return row;
}

export async function listIncentives(input: {
  employeeId?: string;
  engineId?: WorkforceEngineId;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}) {
  const engineId = input.engineId ?? 'fyh_salon';
  const conditions = [eq(wfIncentives.engineId, engineId)];
  if (input.employeeId) conditions.push(eq(wfIncentives.employeeId, input.employeeId));
  if (input.fromDate) conditions.push(gte(wfIncentives.effectiveDate, input.fromDate));
  if (input.toDate) conditions.push(lte(wfIncentives.effectiveDate, input.toDate));

  return hairDb
    .select()
    .from(wfIncentives)
    .where(and(...conditions))
    .orderBy(desc(wfIncentives.effectiveDate))
    .limit(input.limit ?? 50);
}

export async function createDraftPayrollRun(input: {
  engineId?: WorkforceEngineId;
  periodStart?: string;
  periodEnd?: string;
  employeeIds?: string[];
  /** Use fixed salon cycle: previous month, only between 7th–10th. */
  useSalonCycle?: boolean;
  timezone?: string;
  asOf?: Date;
}) {
  const engineId = input.engineId ?? 'fyh_salon';
  const timezone = input.timezone ?? 'Asia/Kolkata';
  const asOf = input.asOf ?? new Date();

  let periodStart = input.periodStart;
  let periodEnd = input.periodEnd;

  if (input.useSalonCycle) {
    if (!isPayrollGenerationWindowOpen(asOf, timezone)) {
      throw new Error(
        'Salary can only be generated between the 7th and 10th of each month.',
      );
    }
    const period = resolvePreviousMonthPeriod(timezone, asOf);
    periodStart = period.periodStart;
    periodEnd = period.periodEnd;
  }

  if (!periodStart || !periodEnd) {
    throw new Error('periodStart and periodEnd are required.');
  }

  const [run] = await hairDb
    .insert(wfPayrollRuns)
    .values({
      engineId,
      periodStart,
      periodEnd,
      status: 'draft',
    })
    .returning();

  const membershipRows =
    input.employeeIds?.map((employeeId) => ({ employeeId })) ??
    (
      await hairDb
        .select({ employeeId: wfEngineMemberships.employeeId })
        .from(wfEngineMemberships)
        .where(
          and(eq(wfEngineMemberships.engineId, engineId), eq(wfEngineMemberships.isActive, true)),
        )
    );

  const ids = membershipRows.map((r) => r.employeeId);

  for (const employeeId of ids) {
    const [empRow] = await hairDb
      .select({ joiningDate: wfEmployees.joiningDate })
      .from(wfEmployees)
      .where(eq(wfEmployees.id, employeeId))
      .limit(1);

    if (
      !isEmployeeEligibleForPeriod(empRow?.joiningDate, {
        periodStart,
        periodEnd,
      })
    ) {
      continue;
    }

    const snap = await getCompensationSnapshot(employeeId, engineId);
    if (!snap) continue;

    const incentives = await listIncentives({
      employeeId,
      engineId,
      fromDate: periodStart,
      toDate: periodEnd,
      limit: 200,
    });
    const incentivePaise = incentives
      .filter((i) => i.status === 'pending' || i.status === 'approved')
      .reduce((sum, i) => sum + i.amountPaise, 0);

    const netPaise = payrollNetPaise({
      salaryPaise: snap.salaryPaise,
      commissionPaise: 0,
      incentivePaise,
      deductionsPaise: 0,
    });

    await hairDb.insert(wfPayrollLines).values({
      payrollRunId: run.id,
      employeeId,
      salaryPaise: snap.salaryPaise,
      commissionPaise: 0,
      incentivePaise,
      deductionsPaise: 0,
      netPaise,
      notes: 'Phase 4 draft — commission from sales attribution wired in a later pass',
    });
  }

  return run;
}

export async function listPayrollRuns(engineId: WorkforceEngineId = 'fyh_salon', limit = 12) {
  return hairDb
    .select()
    .from(wfPayrollRuns)
    .where(eq(wfPayrollRuns.engineId, engineId))
    .orderBy(desc(wfPayrollRuns.createdAt))
    .limit(limit);
}

export async function listPayrollLines(payrollRunId: string) {
  return hairDb
    .select()
    .from(wfPayrollLines)
    .where(eq(wfPayrollLines.payrollRunId, payrollRunId));
}
