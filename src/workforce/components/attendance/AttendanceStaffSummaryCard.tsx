'use client';

import { AttendanceMonthCalendar } from '@/src/workforce/components/attendance/AttendanceMonthCalendar';
import type { StaffMonthAttendanceSummary } from '@/src/workforce/services/attendancePayroll';

type Props = {
  summary: StaffMonthAttendanceSummary;
  showSalary?: boolean;
  selectedDate?: string | null;
  inspectBaseHref?: string;
};

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

export function AttendanceStaffSummaryCard({
  summary,
  showSalary = false,
  selectedDate,
  inspectBaseHref,
}: Props) {
  const allocatedLabel =
    summary.paidLeaveAllocated != null ? String(summary.paidLeaveAllocated) : '—';
  const remainingLabel =
    summary.paidLeaveRemaining != null ? String(summary.paidLeaveRemaining) : '—';

  return (
    <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-4">
      <header className="border-b border-[color:var(--fyh-border)] pb-3">
        <h2 className="text-base font-semibold">{summary.fullName}</h2>
        {showSalary ? (
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Monthly salary: <span className="font-medium text-fyh-text-primary">{inr(summary.salaryPaise)}</span>
          </p>
        ) : null}
      </header>

      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-fyh-text-secondary">Paid leave</p>
          <p>Allocated: {allocatedLabel}</p>
          <p>Used: {summary.paidLeaveDays}</p>
          <p>Remaining: {remainingLabel}</p>
          <p>Extra / unpaid: {summary.extraUnpaidAbsenceDays}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-fyh-text-secondary">Working days</p>
          <p>Working days: {summary.eligibleWorkingDays}</p>
          <p>Present: {summary.presentDays}</p>
          <p>Absent: {summary.absentDays}</p>
        </div>
      </div>

      {showSalary ? (
        <div className="mt-3 grid gap-1 border-t border-[color:var(--fyh-border)] pt-3 text-sm sm:grid-cols-2">
          <p>Per-day basis: {inr(summary.dailySalaryPaise)}</p>
          <p>Absence deduction: {inr(summary.absenceDeductionPaise)}</p>
          <p className="font-semibold sm:col-span-2">Final payable: {inr(summary.finalSalaryPaise)}</p>
        </div>
      ) : null}

      <div className="mt-4">
        <AttendanceMonthCalendar
          days={summary.days}
          selectedDate={selectedDate}
          compact
          onSelectDate={
            inspectBaseHref
              ? (workDate) => {
                  window.location.href = `${inspectBaseHref}&employeeId=${summary.employeeId}&inspectDate=${workDate}`;
                }
              : undefined
          }
        />
      </div>
    </section>
  );
}
