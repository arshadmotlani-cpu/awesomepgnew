import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { listTeamStaffForAttendance } from '@/src/hair/adapters/workforceStaffAdapter';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { AttendanceSectionSubNav } from '@/src/workforce/components/attendance/AttendanceSectionSubNav';
import { AttendanceStaffSummaryCard } from '@/src/workforce/components/attendance/AttendanceStaffSummaryCard';
import { OwnerStaffSelector } from '@/src/workforce/components/attendance/OwnerStaffSelector';
import { requireTeamAttendanceAccess } from '@/src/workforce/actions/attendance';
import { ATTENDANCE_MANAGE_HREF } from '@/src/workforce/lib/attendanceRoutes';
import { listTeamMonthAttendanceSummaries } from '@/src/workforce/services/attendancePayroll';
import { employeeHasPermission } from '@/src/workforce/brains/employeeBrain';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

export default async function OwnerAttendanceMapPage({
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

  const params = await searchParams;
  const monthKey = params.month ?? new Date().toISOString().slice(0, 7);
  const ctx = await getTenantContextForPage();
  const roster = await listTeamStaffForAttendance(ctx);
  const filterEmployeeId = params.employeeId?.trim() || null;

  const employeeIds = filterEmployeeId
    ? roster.filter((r) => r.id === filterEmployeeId).map((r) => r.id)
    : roster.map((r) => r.id);

  const summaries = await listTeamMonthAttendanceSummaries({
    employeeIds,
    monthKey,
  });

  const inspectBaseHref = `${ATTENDANCE_MANAGE_HREF}?month=${monthKey}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Attendance map</h1>
          <p className="text-sm text-fyh-text-secondary">
            Monthly attendance overview for your team.
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
        <OwnerStaffSelector
          roster={roster}
          selectedId={filterEmployeeId ?? ''}
          allowAll
        />
        <button type="submit" className="rounded border border-[color:var(--fyh-border)] px-3 py-2 text-sm">
          Apply
        </button>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        {summaries.map((summary) => (
          <AttendanceStaffSummaryCard
            key={summary.employeeId}
            summary={summary}
            showSalary={canSalary}
            inspectBaseHref={inspectBaseHref}
          />
        ))}
      </div>

      {summaries.length === 0 ? (
        <p className="text-sm text-fyh-text-secondary">No attendance data for the selected filters.</p>
      ) : null}
    </div>
  );
}
