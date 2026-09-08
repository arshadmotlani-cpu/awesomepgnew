import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { hairDb } from '@/src/hair/db/client';
import { orgFilter, tenantWriteDefaults } from '@/src/hair/lib/tenant/filters';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';
import {
  wfEmployees,
  wfEngineMemberships,
  wfPayrollLines,
  wfPayrollPayments,
  wfPayrollRuns,
} from '@/src/workforce/db/schema';
import {
  defaultPayrollMonthKey,
  isPayrollPeriodAvailable,
  payrollPeriodFromMonthKey,
} from '@/src/workforce/lib/payrollAvailability';
import { formatStaffDisplayName } from '@/src/workforce/lib/staffDisplayName';
import { createDraftPayrollRun } from '@/src/workforce/services/compensation';
import { buildStaffMonthAttendanceSummary } from '@/src/workforce/services/attendancePayroll';
import type { WorkforceEngineId } from '@/src/workforce/types';

export type PayrollLineDetail = {
  lineId: string;
  employeeId: string;
  fullName: string;
  upiId: string | null;
  qrCodeUrl: string | null;
  salaryPaise: number;
  commissionPaise: number;
  incentivePaise: number;
  deductionsPaise: number;
  netPaise: number;
  notes: string | null;
  eligibleWorkingDays: number;
  presentDays: number;
  absentDays: number;
  paidLeaveDays: number;
  paidLeaveAllocated: number | null;
  extraUnpaidAbsenceDays: number;
  payment: {
    id: string;
    amountPaise: number;
    paymentMethod: string;
    paymentReference: string | null;
    paidAt: Date;
    paidByName: string | null;
  } | null;
  status: 'pending' | 'paid';
};

export type PayrollRunDetail = {
  runId: string;
  monthKey: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  employeeCount: number;
  totalSalaryPaise: number;
  totalIncentivePaise: number;
  totalDeductionsPaise: number;
  netPayablePaise: number;
  paidPaise: number;
  pendingPaise: number;
  lines: PayrollLineDetail[];
};

const payerEmployees = alias(wfEmployees, 'payer_employees');

async function findRunForPeriod(input: {
  periodStart: string;
  periodEnd: string;
  engineId: WorkforceEngineId;
  ctx: TenantContext | null;
}) {
  const [run] = await hairDb
    .select()
    .from(wfPayrollRuns)
    .where(
      and(
        eq(wfPayrollRuns.engineId, input.engineId),
        eq(wfPayrollRuns.periodStart, input.periodStart),
        eq(wfPayrollRuns.periodEnd, input.periodEnd),
        orgFilter(wfPayrollRuns.organizationId, input.ctx),
      ),
    )
    .limit(1);
  return run ?? null;
}

export async function getOrCreatePayrollRunForMonth(input: {
  monthKey?: string;
  engineId?: WorkforceEngineId;
  timezone?: string;
  ctx?: TenantContext | null;
  asOf?: Date;
}) {
  const ctx = await resolveTenantContextForService(input.ctx);
  const engineId = input.engineId ?? 'fyh_salon';
  const timezone = input.timezone ?? 'Asia/Kolkata';
  const monthKey = input.monthKey ?? defaultPayrollMonthKey(timezone, input.asOf);
  const period = payrollPeriodFromMonthKey(monthKey);

  if (!isPayrollPeriodAvailable(period, timezone, input.asOf)) {
    throw new Error('This salary period is not available yet.');
  }

  const existing = await findRunForPeriod({ ...period, engineId, ctx });
  if (existing) return existing;

  try {
    return await createDraftPayrollRun({
      engineId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      ...(ctx?.organizationId ? { organizationId: ctx.organizationId } : {}),
    });
  } catch (err) {
    const retry = await findRunForPeriod({ ...period, engineId, ctx });
    if (retry) return retry;
    throw err;
  }
}

export async function loadPayrollRunDetail(input: {
  monthKey: string;
  engineId?: WorkforceEngineId;
  timezone?: string;
  ctx?: TenantContext | null;
  asOf?: Date;
  allowCreate?: boolean;
  includePaymentDetails?: boolean;
}): Promise<PayrollRunDetail> {
  const ctx = await resolveTenantContextForService(input.ctx);
  const engineId = input.engineId ?? 'fyh_salon';
  const timezone = input.timezone ?? 'Asia/Kolkata';
  const period = payrollPeriodFromMonthKey(input.monthKey);
  const allowCreate = input.allowCreate ?? true;
  const includePaymentDetails = input.includePaymentDetails ?? false;

  if (!isPayrollPeriodAvailable(period, timezone, input.asOf)) {
    throw new Error('This salary period is not available yet.');
  }

  let run = await findRunForPeriod({ ...period, engineId, ctx });
  if (!run) {
    if (!allowCreate) {
      return {
        runId: '',
        monthKey: input.monthKey,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        status: 'pending',
        employeeCount: 0,
        totalSalaryPaise: 0,
        totalIncentivePaise: 0,
        totalDeductionsPaise: 0,
        netPayablePaise: 0,
        paidPaise: 0,
        pendingPaise: 0,
        lines: [],
      };
    }
    run = await getOrCreatePayrollRunForMonth({
      monthKey: input.monthKey,
      engineId,
      timezone,
      ctx,
      asOf: input.asOf,
    });
  }

  const rows = await hairDb
    .select({
      line: wfPayrollLines,
      employee: wfEmployees,
      payment: wfPayrollPayments,
      payerName: payerEmployees.fullName,
    })
    .from(wfPayrollLines)
    .innerJoin(wfEmployees, eq(wfEmployees.id, wfPayrollLines.employeeId))
    .innerJoin(
      wfEngineMemberships,
      and(
        eq(wfEngineMemberships.employeeId, wfEmployees.id),
        eq(wfEngineMemberships.engineId, engineId),
        eq(wfEngineMemberships.isActive, true),
      ),
    )
    .leftJoin(wfPayrollPayments, eq(wfPayrollPayments.payrollLineId, wfPayrollLines.id))
    .leftJoin(payerEmployees, eq(payerEmployees.id, wfPayrollPayments.paidByEmployeeId))
    .where(
      and(
        eq(wfPayrollLines.payrollRunId, run.id),
        orgFilter(wfPayrollLines.organizationId, ctx),
        orgFilter(wfEmployees.organizationId, ctx),
      ),
    )
    .orderBy(wfEmployees.fullName);

  const lines: PayrollLineDetail[] = [];
  for (const row of rows) {
    const monthSummary = await buildStaffMonthAttendanceSummary({
      employeeId: row.line.employeeId,
      monthKey: input.monthKey,
      engineId,
      todayKey: period.periodEnd,
    });

    lines.push({
      lineId: row.line.id,
      employeeId: row.line.employeeId,
      fullName: formatStaffDisplayName(row.employee.fullName),
      upiId: includePaymentDetails ? row.employee.upiId : null,
      qrCodeUrl: includePaymentDetails ? row.employee.qrCodeUrl : null,
      salaryPaise: row.line.salaryPaise,
      commissionPaise: row.line.commissionPaise,
      incentivePaise: row.line.incentivePaise,
      deductionsPaise: row.line.deductionsPaise,
      netPaise: row.line.netPaise,
      notes: row.line.notes,
      eligibleWorkingDays: monthSummary?.eligibleWorkingDays ?? 0,
      presentDays: monthSummary?.presentDays ?? 0,
      absentDays: monthSummary?.absentDays ?? 0,
      paidLeaveDays: monthSummary?.paidLeaveDays ?? 0,
      paidLeaveAllocated: monthSummary?.paidLeaveAllocated ?? null,
      extraUnpaidAbsenceDays: monthSummary?.extraUnpaidAbsenceDays ?? 0,
      payment: row.payment
        ? {
            id: row.payment.id,
            amountPaise: row.payment.amountPaise,
            paymentMethod: row.payment.paymentMethod,
            paymentReference: row.payment.paymentReference,
            paidAt: row.payment.paidAt,
            paidByName: row.payerName ? formatStaffDisplayName(row.payerName) : null,
          }
        : null,
      status: row.payment ? 'paid' : 'pending',
    });
  }

  const totalSalaryPaise = lines.reduce((s, l) => s + l.salaryPaise, 0);
  const totalIncentivePaise = lines.reduce((s, l) => s + l.incentivePaise + l.commissionPaise, 0);
  const totalDeductionsPaise = lines.reduce((s, l) => s + l.deductionsPaise, 0);
  const netPayablePaise = lines.reduce((s, l) => s + l.netPaise, 0);
  const paidPaise = lines.reduce((s, l) => s + (l.payment?.amountPaise ?? 0), 0);

  return {
    runId: run.id,
    monthKey: input.monthKey,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    status: run.status,
    employeeCount: lines.length,
    totalSalaryPaise,
    totalIncentivePaise,
    totalDeductionsPaise,
    netPayablePaise,
    paidPaise,
    pendingPaise: netPayablePaise - paidPaise,
    lines,
  };
}

export async function loadOwnPayrollLineDetail(input: {
  employeeId: string;
  monthKey?: string;
  engineId?: WorkforceEngineId;
  timezone?: string;
  ctx?: TenantContext | null;
  asOf?: Date;
  allowCreate?: boolean;
  includePaymentDetails?: boolean;
}): Promise<PayrollLineDetail | null> {
  const ctx = await resolveTenantContextForService(input.ctx);
  const timezone = input.timezone ?? 'Asia/Kolkata';
  const monthKey = input.monthKey ?? defaultPayrollMonthKey(timezone, input.asOf);
  const detail = await loadPayrollRunDetail({
    monthKey,
    engineId: input.engineId,
    timezone,
    ctx,
    asOf: input.asOf,
    allowCreate: input.allowCreate ?? false,
    includePaymentDetails: input.includePaymentDetails ?? true,
  });
  return detail.lines.find((l) => l.employeeId === input.employeeId) ?? null;
}

async function refreshRunPaymentStatus(runId: string) {
  const [counts] = await hairDb
    .select({
      total: sql<number>`count(*)::int`,
      paid: sql<number>`count(${wfPayrollPayments.id})::int`,
    })
    .from(wfPayrollLines)
    .leftJoin(wfPayrollPayments, eq(wfPayrollPayments.payrollLineId, wfPayrollLines.id))
    .where(eq(wfPayrollLines.payrollRunId, runId));

  const total = counts?.total ?? 0;
  const paid = counts?.paid ?? 0;
  const status = total > 0 && paid >= total ? 'paid' : paid > 0 ? 'partial' : 'pending';
  await hairDb.update(wfPayrollRuns).set({ status }).where(eq(wfPayrollRuns.id, runId));
}

export async function recordPayrollPayment(input: {
  payrollLineId: string;
  paymentMethod?: string;
  paymentReference?: string | null;
  paidByEmployeeId?: string | null;
  ctx?: TenantContext | null;
}) {
  const ctx = await resolveTenantContextForService(input.ctx);
  const defaults = tenantWriteDefaults(ctx);

  const [line] = await hairDb
    .select({
      line: wfPayrollLines,
      run: wfPayrollRuns,
    })
    .from(wfPayrollLines)
    .innerJoin(wfPayrollRuns, eq(wfPayrollRuns.id, wfPayrollLines.payrollRunId))
    .where(
      and(eq(wfPayrollLines.id, input.payrollLineId), orgFilter(wfPayrollLines.organizationId, ctx)),
    )
    .limit(1);

  if (!line) throw new Error('Payroll line not found.');

  const [existing] = await hairDb
    .select()
    .from(wfPayrollPayments)
    .where(eq(wfPayrollPayments.payrollLineId, input.payrollLineId))
    .limit(1);

  if (existing) return existing;

  const [payment] = await hairDb
    .insert(wfPayrollPayments)
    .values({
      ...defaults,
      payrollRunId: line.line.payrollRunId,
      payrollLineId: line.line.id,
      employeeId: line.line.employeeId,
      amountPaise: line.line.netPaise,
      paymentMethod: input.paymentMethod?.trim() || 'upi',
      paymentReference: input.paymentReference?.trim() || null,
      paidByEmployeeId: input.paidByEmployeeId ?? null,
    })
    .returning();

  await refreshRunPaymentStatus(line.run.id);
  return payment!;
}

export async function listPayrollRunsForTenant(input: {
  engineId?: WorkforceEngineId;
  ctx?: TenantContext | null;
  limit?: number;
}) {
  const ctx = await resolveTenantContextForService(input.ctx);
  const engineId = input.engineId ?? 'fyh_salon';
  return hairDb
    .select()
    .from(wfPayrollRuns)
    .where(and(eq(wfPayrollRuns.engineId, engineId), orgFilter(wfPayrollRuns.organizationId, ctx)))
    .orderBy(desc(wfPayrollRuns.periodStart))
    .limit(input.limit ?? 12);
}
