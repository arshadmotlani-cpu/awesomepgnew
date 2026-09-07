import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { listBookableStaffForSalon } from '@/src/hair/adapters/workforceStaffAdapter';
import { listTeamMonthAttendanceSummaries } from '@/src/workforce/services/attendancePayroll';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import { submitCorrectionForm } from '@/src/workforce/actions/attendance';
import { ATTENDANCE_STATUSES } from '@/src/workforce/services/attendance';

export default async function OwnerAttendanceManagePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; employeeId?: string }>;
}) {
  await requireHairHost();
  if (!isWorkforceEngineEnabled()) redirect('/dashboard');

  const session = await getHairSession();
  if (!session?.workforceEmployeeId) redirect('/login');

  const canView = await employeeHasPermission(
    session.workforceEmployeeId,
    'fyh_salon',
    'attendance.view_team',
  );
  if (!canView) redirect('/attendance');

  const canSalary = await employeeHasPermission(
    session.workforceEmployeeId,
    'fyh_salon',
    'finance.view_salary',
  );
  const canCorrect = await employeeHasPermission(
    session.workforceEmployeeId,
    'fyh_salon',
    'attendance.correct',
  );

  const params = await searchParams;
  const monthKey = params.month ?? new Date().toISOString().slice(0, 7);
  const roster = await listBookableStaffForSalon();
  const selectedId = params.employeeId ?? roster[0]?.id;
  const summaries = await listTeamMonthAttendanceSummaries({
    employeeIds: roster.map((r) => r.id),
    monthKey,
  });
  const selected = summaries.find((s) => s.employeeId === selectedId) ?? summaries[0];

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Team attendance</h1>
          <p className="text-sm text-fyh-text-secondary">Review staff attendance and salary impact.</p>
        </div>
        <Link href="/settings/attendance" className="text-sm text-fyh-accent underline">
          Office location
        </Link>
      </header>

      <form method="get" className="flex flex-wrap gap-3 text-sm">
        <label>
          Month
          <input
            name="month"
            type="month"
            defaultValue={monthKey}
            className="ml-2 rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
          />
        </label>
        <label>
          Staff
          <select
            name="employeeId"
            defaultValue={selected?.employeeId}
            className="ml-2 rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
          >
            {roster.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="self-end rounded border border-[color:var(--fyh-border)] px-3 py-1">
          Apply
        </button>
      </form>

      {selected ? (
        <>
          <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
            <h2 className="text-lg font-medium">{selected.fullName}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-fyh-text-secondary">Present</p>
                <p className="text-lg font-semibold">{selected.presentDays}</p>
              </div>
              <div>
                <p className="text-fyh-text-secondary">Absent</p>
                <p className="text-lg font-semibold">{selected.absentDays}</p>
              </div>
              <div>
                <p className="text-fyh-text-secondary">Paid leave</p>
                <p className="text-lg font-semibold">{selected.paidLeaveDays}</p>
              </div>
              <div>
                <p className="text-fyh-text-secondary">Working days</p>
                <p className="text-lg font-semibold">{selected.eligibleWorkingDays}</p>
              </div>
            </div>
            {canSalary ? (
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <p>Monthly salary: ₹{(selected.salaryPaise / 100).toLocaleString('en-IN')}</p>
                <p>Per-day basis: ₹{(selected.dailySalaryPaise / 100).toLocaleString('en-IN')}</p>
                <p>Absence deduction: ₹{(selected.absenceDeductionPaise / 100).toLocaleString('en-IN')}</p>
                <p className="font-medium">
                  Final payable: ₹{(selected.finalSalaryPaise / 100).toLocaleString('en-IN')}
                </p>
              </div>
            ) : null}
          </section>

          {canCorrect ? (
            <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
              <h2 className="text-lg font-medium">Owner correction</h2>
              <form action={submitCorrectionForm} className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <input type="hidden" name="employeeId" value={selected.employeeId} />
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
      ) : null}
    </div>
  );
}
