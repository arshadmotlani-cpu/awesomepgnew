import { salonDayOfWeek } from '@/src/hair/lib/salonTime';
import type { AttendanceStatus } from '@/src/workforce/services/attendance';

export type DayScheduleLike = { dayOfWeek: number; isOff: boolean };

export type AttendanceDayClassification =
  | 'present'
  | 'absent'
  | 'paid_leave'
  | 'weekly_off'
  | 'holiday'
  | 'future'
  | 'not_marked';

export type MonthAttendanceCounts = {
  eligibleWorkingDays: number;
  presentDays: number;
  absentDays: number;
  paidLeaveDays: number;
  weeklyOffDays: number;
};

export function isWeeklyOffDay(schedule: DayScheduleLike[], workDate: string, timezone: string): boolean {
  const dow = salonDayOfWeek(timezone, new Date(`${workDate}T12:00:00Z`));
  const day = schedule.find((s) => s.dayOfWeek === dow);
  return day?.isOff === true;
}

export function dailySalaryPaise(monthlySalaryPaise: number, eligibleWorkingDays: number): number {
  if (monthlySalaryPaise <= 0 || eligibleWorkingDays <= 0) return 0;
  return Math.floor(monthlySalaryPaise / eligibleWorkingDays);
}

export function absenceDeductionPaise(
  monthlySalaryPaise: number,
  absentDays: number,
  eligibleWorkingDays: number,
): number {
  if (monthlySalaryPaise <= 0 || absentDays <= 0 || eligibleWorkingDays <= 0) return 0;
  return dailySalaryPaise(monthlySalaryPaise, eligibleWorkingDays) * absentDays;
}

export function payrollNetAfterAttendance(input: {
  monthlySalaryPaise: number;
  commissionPaise: number;
  incentivePaise: number;
  otherDeductionsPaise: number;
  absentDays: number;
  eligibleWorkingDays: number;
}): {
  absenceDeductionPaise: number;
  netPaise: number;
  dailySalaryPaise: number;
} {
  const daily = dailySalaryPaise(input.monthlySalaryPaise, input.eligibleWorkingDays);
  const absenceDeduction = absenceDeductionPaise(
    input.monthlySalaryPaise,
    input.absentDays,
    input.eligibleWorkingDays,
  );
  const netPaise =
    Math.max(0, input.monthlySalaryPaise) +
    Math.max(0, input.commissionPaise) +
    Math.max(0, input.incentivePaise) -
    Math.max(0, input.otherDeductionsPaise) -
    absenceDeduction;
  return { absenceDeductionPaise: absenceDeduction, netPaise, dailySalaryPaise: daily };
}

export function classifyAttendanceDay(input: {
  workDate: string;
  todayKey: string;
  schedule: DayScheduleLike[];
  timezone: string;
  record?: { status: AttendanceStatus; clockInAt?: Date | null } | null;
}): AttendanceDayClassification {
  if (input.workDate > input.todayKey) return 'future';
  if (isWeeklyOffDay(input.schedule, input.workDate, input.timezone)) return 'weekly_off';
  const status = input.record?.status;
  if (status === 'leave') return 'paid_leave';
  if (status === 'holiday') return 'holiday';
  if (status === 'present' || status === 'late' || status === 'half_day' || input.record?.clockInAt) {
    return 'present';
  }
  if (status === 'absent') return 'absent';
  if (input.workDate < input.todayKey) return 'absent';
  return 'not_marked';
}

export function summarizeMonthAttendance(input: {
  dates: string[];
  todayKey: string;
  schedule: DayScheduleLike[];
  timezone: string;
  recordsByDate: Map<string, { status: AttendanceStatus; clockInAt?: Date | null }>;
}): MonthAttendanceCounts {
  let eligibleWorkingDays = 0;
  let presentDays = 0;
  let absentDays = 0;
  let paidLeaveDays = 0;
  let weeklyOffDays = 0;

  for (const workDate of input.dates) {
    const classification = classifyAttendanceDay({
      workDate,
      todayKey: input.todayKey,
      schedule: input.schedule,
      timezone: input.timezone,
      record: input.recordsByDate.get(workDate) ?? null,
    });
    switch (classification) {
      case 'weekly_off':
      case 'holiday':
        weeklyOffDays += 1;
        break;
      case 'paid_leave':
        eligibleWorkingDays += 1;
        paidLeaveDays += 1;
        break;
      case 'present':
        eligibleWorkingDays += 1;
        presentDays += 1;
        break;
      case 'absent':
        eligibleWorkingDays += 1;
        absentDays += 1;
        break;
      case 'not_marked':
        if (workDate <= input.todayKey) eligibleWorkingDays += 1;
        break;
      default:
        break;
    }
  }

  return { eligibleWorkingDays, presentDays, absentDays, paidLeaveDays, weeklyOffDays };
}
