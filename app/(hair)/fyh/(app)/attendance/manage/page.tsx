import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { listTeamStaffForAttendance } from '@/src/hair/adapters/workforceStaffAdapter';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { AttendanceSectionSubNav } from '@/src/workforce/components/attendance/AttendanceSectionSubNav';
import { OwnerStaffSelector } from '@/src/workforce/components/attendance/OwnerStaffSelector';
import { AttendanceMonthCalendar } from '@/src/workforce/components/attendance/AttendanceMonthCalendar';
import {
  requireTeamAttendanceAccess,
  submitCorrectionForm,
  submitOwnerMarkPresentForm,
} from '@/src/workforce/actions/attendance';
import { ATTENDANCE_MAP_HREF } from '@/src/workforce/lib/attendanceRoutes';
import { canonicalBusinessDate } from '@/src/workforce/lib/attendanceBusinessDate';
import { buildStaffMonthAttendanceSummary } from '@/src/workforce/services/attendancePayroll';
import { getTodayAttendance, ATTENDANCE_STATUSES } from '@/src/workforce/services/attendance';
import { getSalonSettings } from '@/src/hair/services/settings';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

export default async function OwnerAttendanceManagePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; employeeId?: string; inspectDate?: string }>;
}) {
  await requireHairHost();
  if (!isWorkforceEngineEnabled()) redirect('/dashboard');

  const { session, isSuperAdmin } = await requireTeamAttendanceAccess();

  const canSalary =
    isSuperAdmin ||
    (session.workforceEmployeeId
      ? await employeeHasPermission(
          session.workforceEmployeeId,
          'fyh_salon',
          'finance.view_salary',
        )
      : false);
  const canCorrect =
    isSuperAdmin ||
    (session.workforceEmployeeId
      ? await employeeHasPermission(
          session.workforceEmployeeId,
          'fyh_salon',
          'attendance.correct',
        )
      : false);

  const params = await searchParams;
  const monthKey = params.month ?? new Date().toISOString().slice(0, 7);
  const ctx = await getTenantContextForPage();
  const roster = await listTeamStaffForAttendance(ctx);
  const selectedId = params.employeeId ?? roster[0]?.id;
  const selectedStaff = roster.find((r) => r.id === selectedId) ?? roster[0];

  const settings = await getSalonSettings();
  const timezone = settings.timezone ?? 'Asia/Kolkata';
  const todayKey = canonicalBusinessDate(timezone);

  const summary = selectedStaff
    ? await buildStaffMonthAttendanceSummary({
        employeeId: selectedStaff.id,
        monthKey,
      })
    : null;

  const todayRecord = selectedStaff
    ? await getTodayAttendance({ employeeId: selectedStaff.id, timezone })
    : null;

  const todayMarked = Boolean(todayRecord?.clockInAt && todayRecord?.lockedAt);
  const inspectDate = params.inspectDate ?? null;
  const inspectDay = inspectDate ? summary?.days.find((d) => d.workDate === inspectDate) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Team attendance</h1>
          <p className="text-sm text-fyh-text-secondary">
            Mark or correct staff attendance for today and past dates.
          </p>
        </div>
        <Link href="/settings/attendance" className="text-sm text-fyh-accent underline">
          Office location
        </Link>
      </header>

      <AttendanceSectionSubNav />

      <form method="get" className="flex flex-wrap items-end gap-4 rounded-xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-4">
        <label className="text-sm">
          Month
          <input
            name="month"
            type="month"
            defaultValue={monthKey}
            className="ml-2 rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
          />
        </label>
        <OwnerStaffSelector roster={roster} selectedId={selectedId} />
        <button type="submit" className="rounded border border-[color:var(--fyh-border)] px-3 py-2 text-sm">
          Apply
        </button>
        <Link href={ATTENDANCE_MAP_HREF} className="text-sm text-fyh-accent underline">
          Open Attendance Map
        </Link>
      </form>

      {selectedStaff && summary ? (
        <>
          <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
            <h2 className="text-lg font-medium">{summary.fullName}</h2>
            <p className="mt-1 text-sm text-fyh-text-secondary">Today ({todayKey})</p>
            <p className="mt-2 text-sm">
              Status:{' '}
              <span className="font-medium">{todayMarked ? 'Present (locked)' : 'Not marked'}</span>
            </p>

            {canCorrect && !todayMarked ? (
              <form action={submitOwnerMarkPresentForm} className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="employeeId" value={selectedStaff.id} />
                <input type="hidden" name="reason" value="Owner marked present for today" />
                <button
                  type="submit"
                  className="rounded-lg bg-fyh-accent px-4 py-2 text-sm font-medium text-black"
                >
                  Mark present for today
                </button>
              </form>
            ) : null}
          </section>

          <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
            <h3 className="text-sm font-medium uppercase tracking-wide text-fyh-text-secondary">
              Month overview
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-fyh-text-secondary">Present</p>
                <p className="text-lg font-semibold">{summary.presentDays}</p>
              </div>
              <div>
                <p className="text-fyh-text-secondary">Absent</p>
                <p className="text-lg font-semibold">{summary.absentDays}</p>
              </div>
              <div>
                <p className="text-fyh-text-secondary">Paid leave</p>
                <p className="text-lg font-semibold">{summary.paidLeaveDays}</p>
              </div>
              <div>
                <p className="text-fyh-text-secondary">Working days</p>
                <p className="text-lg font-semibold">{summary.eligibleWorkingDays}</p>
              </div>
            </div>
            {canSalary ? (
              <div className="mt-4 grid gap-2 border-t border-[color:var(--fyh-border)] pt-4 text-sm sm:grid-cols-2">
                <p>Monthly salary: ₹{(summary.salaryPaise / 100).toLocaleString('en-IN')}</p>
                <p>Per-day basis: ₹{(summary.dailySalaryPaise / 100).toLocaleString('en-IN')}</p>
                <p>Absence deduction: ₹{(summary.absenceDeductionPaise / 100).toLocaleString('en-IN')}</p>
                <p className="font-medium">
                  Final payable: ₹{(summary.finalSalaryPaise / 100).toLocaleString('en-IN')}
                </p>
              </div>
            ) : null}
            <div className="mt-4">
              <AttendanceMonthCalendar
                days={summary.days}
                selectedDate={inspectDate}
                inspectBaseHref={`/attendance/manage?month=${monthKey}`}
                employeeId={selectedStaff.id}
              />
            </div>
          </section>

          {inspectDay && canCorrect ? (
            <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
              <h2 className="text-lg font-medium">
                Inspect {inspectDate} — {inspectDay.classification}
              </h2>
              <form action={submitCorrectionForm} className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <input type="hidden" name="employeeId" value={selectedStaff.id} />
                <label>
                  Date
                  <input
                    name="workDate"
                    type="date"
                    defaultValue={inspectDate ?? ''}
                    required
                    readOnly
                    className="mt-1 block w-full rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
                  />
                </label>
                <label>
                  Status
                  <select
                    name="status"
                    required
                    defaultValue="present"
                    className="mt-1 block w-full rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
                  >
                    {ATTENDANCE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sm:col-span-2">
                  Reason (required)
                  <input
                    name="reason"
                    required
                    minLength={3}
                    placeholder="Why is this correction needed?"
                    className="mt-1 block w-full rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded bg-fyh-accent px-4 py-2 font-medium text-black sm:col-span-2 sm:w-fit"
                >
                  Save correction
                </button>
              </form>
            </section>
          ) : null}

          {canCorrect && !inspectDay ? (
            <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
              <h2 className="text-lg font-medium">Owner correction</h2>
              <p className="mt-1 text-sm text-fyh-text-secondary">
                Click a date in the calendar above, or enter a historical date below.
              </p>
              <form action={submitCorrectionForm} className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <input type="hidden" name="employeeId" value={selectedStaff.id} />
                <label>
                  Date
                  <input
                    name="workDate"
                    type="date"
                    required
                    className="mt-1 block w-full rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
                  />
                </label>
                <label>
                  Status
                  <select
                    name="status"
                    required
                    className="mt-1 block w-full rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
                  >
                    {ATTENDANCE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sm:col-span-2">
                  Reason (required)
                  <input
                    name="reason"
                    required
                    minLength={3}
                    className="mt-1 block w-full rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded bg-fyh-accent px-4 py-2 font-medium text-black sm:col-span-2 sm:w-fit"
                >
                  Save correction
                </button>
              </form>
            </section>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-fyh-text-secondary">No active staff found for this organization.</p>
      )}
    </div>
  );
}
