import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { getSalonSettings } from '@/src/hair/services/settings';
import { wfEmployees, wfEngineMemberships } from '@/src/workforce/db/schema';
import {
  canonicalBusinessDate,
  enumerateDatesInclusive,
  monthBoundsFromDayKey,
} from '@/src/workforce/lib/attendanceBusinessDate';
import {
  payrollNetAfterAttendance,
  summarizeMonthAttendance,
  type AttendanceDayClassification,
  classifyAttendanceDay,
} from '@/src/workforce/lib/attendanceSalaryMath';
import { listAttendance, type AttendanceStatus } from '@/src/workforce/services/attendance';
import { getEmployeeSchedule } from '@/src/workforce/services/schedules';
import { formatStaffDisplayName } from '@/src/workforce/lib/staffDisplayName';
import type { WorkforceEngineId } from '@/src/workforce/types';

export type StaffMonthAttendanceSummary = {
  employeeId: string;
  fullName: string;
  salaryPaise: number;
  monthStart: string;
  monthEnd: string;
  eligibleWorkingDays: number;
  presentDays: number;
  absentDays: number;
  paidLeaveDays: number;
  weeklyOffDays: number;
  /** HR entitlement field not yet on wf_employees — null until configured. */
  paidLeaveAllocated: number | null;
  paidLeaveRemaining: number | null;
  extraUnpaidAbsenceDays: number;
  dailySalaryPaise: number;
  absenceDeductionPaise: number;
  finalSalaryPaise: number;
  days: Array<{ workDate: string; classification: AttendanceDayClassification }>;
};

export async function buildStaffMonthAttendanceSummary(input: {
  employeeId: string;
  monthKey?: string;
  engineId?: WorkforceEngineId;
  todayKey?: string;
}): Promise<StaffMonthAttendanceSummary | null> {
  const engineId = input.engineId ?? 'fyh_salon';
  const settings = await getSalonSettings();
  const timezone = settings.timezone ?? 'Asia/Kolkata';
  const todayKey = input.todayKey ?? canonicalBusinessDate(timezone);
  const monthKey = input.monthKey ?? todayKey.slice(0, 7);
  const { monthStart, monthEnd } = monthBoundsFromDayKey(`${monthKey}-01`);

  const [emp] = await hairDb
    .select({ id: wfEmployees.id, fullName: wfEmployees.fullName, salaryPaise: wfEmployees.salaryPaise })
    .from(wfEmployees)
    .innerJoin(
      wfEngineMemberships,
      and(
        eq(wfEngineMemberships.employeeId, wfEmployees.id),
        eq(wfEngineMemberships.engineId, engineId),
        eq(wfEngineMemberships.isActive, true),
      ),
    )
    .where(eq(wfEmployees.id, input.employeeId))
    .limit(1);

  if (!emp) return null;

  const schedule = await getEmployeeSchedule(input.employeeId, engineId);
  const records = await listAttendance({
    employeeId: input.employeeId,
    engineId,
    fromDate: monthStart,
    toDate: monthEnd,
    limit: 62,
  });
  const recordsByDate = new Map(
    records.map((r) => [
      r.workDate,
      { status: r.status as AttendanceStatus, clockInAt: r.clockInAt },
    ]),
  );

  const dates = enumerateDatesInclusive(monthStart, monthEnd);
  const counts = summarizeMonthAttendance({
    dates,
    todayKey,
    schedule,
    timezone,
    recordsByDate,
  });

  const payroll = payrollNetAfterAttendance({
    monthlySalaryPaise: emp.salaryPaise,
    commissionPaise: 0,
    incentivePaise: 0,
    otherDeductionsPaise: 0,
    absentDays: counts.absentDays,
    eligibleWorkingDays: counts.eligibleWorkingDays,
  });

  return {
    employeeId: emp.id,
    fullName: formatStaffDisplayName(emp.fullName),
    salaryPaise: emp.salaryPaise,
    monthStart,
    monthEnd,
    ...counts,
    paidLeaveAllocated: null,
    paidLeaveRemaining: null,
    extraUnpaidAbsenceDays: counts.absentDays,
    dailySalaryPaise: payroll.dailySalaryPaise,
    absenceDeductionPaise: payroll.absenceDeductionPaise,
    finalSalaryPaise: payroll.netPaise,
    days: dates.map((workDate) => ({
      workDate,
      classification: classifyAttendanceDay({
        workDate,
        todayKey,
        schedule,
        timezone,
        record: recordsByDate.get(workDate) ?? null,
      }),
    })),
  };
}

export async function listTeamMonthAttendanceSummaries(input: {
  employeeIds: string[];
  monthKey?: string;
  engineId?: WorkforceEngineId;
}): Promise<StaffMonthAttendanceSummary[]> {
  const out: StaffMonthAttendanceSummary[] = [];
  for (const employeeId of input.employeeIds) {
    const summary = await buildStaffMonthAttendanceSummary({
      employeeId,
      monthKey: input.monthKey,
      engineId: input.engineId,
    });
    if (summary) out.push(summary);
  }
  return out;
}

export async function computeAttendanceDeductionForPayroll(input: {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  monthlySalaryPaise: number;
  engineId?: WorkforceEngineId;
}): Promise<number> {
  if (input.monthlySalaryPaise <= 0) return 0;
  const summary = await buildStaffMonthAttendanceSummary({
    employeeId: input.employeeId,
    monthKey: input.periodStart.slice(0, 7),
    engineId: input.engineId,
    todayKey: input.periodEnd,
  });
  return summary?.absenceDeductionPaise ?? 0;
}
