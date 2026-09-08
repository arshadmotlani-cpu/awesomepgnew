import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { getEmployeeDashboard } from '@/src/workforce/brains/employeeBrain';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import { workforceAccessRoleLabel } from '@/src/workforce/labels';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';
import { logoutAction } from '@/src/hair/actions/auth';
import { getStaffPerformanceSummary } from '@/src/hair/services/staffPerformance';
import { salonDayBounds, salonMonthStartUtc } from '@/src/hair/lib/salonTime';
import { getSalonSettings } from '@/src/hair/services/settings';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function TeamMemberMePage() {
  await requireHairHost();
  if (!isWorkforceEngineEnabled()) redirect('/dashboard');

  const session = await getHairSession();
  if (!session?.workforceEmployeeId) redirect('/login');

  const dash = await getEmployeeDashboard(session.workforceEmployeeId, 'fyh_salon');
  if (!dash) redirect('/login');

  if (dash.grants && hasWorkforcePermission(dash.grants, 'staff.view')) {
    redirect('/workforce/home');
  }

  const accessRoleLabel = dash.membership
    ? workforceAccessRoleLabel(dash.membership.jobRole)
    : 'Team member';

  const settings = await getSalonSettings();
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const { end } = salonDayBounds(tz);
  const from = salonMonthStartUtc(tz);
  const monthPerf = await getStaffPerformanceSummary(session.workforceEmployeeId, { from, to: end });
  const ownRevenuePaise =
    monthPerf.serviceRevenuePaise +
    monthPerf.productRevenuePaise +
    monthPerf.packageRevenuePaise +
    monthPerf.membershipRevenuePaise;

  const canViewOwnSalaryLink =
    dash.grants != null && hasWorkforcePermission(dash.grants, 'finance.view_own_salary');

  return (
    <div className="min-h-screen bg-[color:var(--fyh-bg)] px-4 py-8 text-fyh-text">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-fyh-text-secondary">Staff dashboard</p>
            <h1 className="text-3xl font-semibold">{dash.employee.fullName}</h1>
            <p className="text-sm text-fyh-text-secondary">
              {accessRoleLabel}
              {dash.employee.mobile ? ` · ${dash.employee.mobile}` : ''}
            </p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-fyh-accent underline">
              Sign out
            </button>
          </form>
        </header>

        {canViewOwnSalaryLink ? (
          <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-medium">Salary</h2>
              <Link href="/expenses/salary" className="text-sm text-fyh-accent underline">
                View my salary
              </Link>
            </div>
            <p className="mt-2 text-sm text-fyh-text-secondary">
              See your monthly salary calculation, attendance deductions, and incentives.
            </p>
          </section>
        ) : null}

        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Attendance</h2>
            <Link href="/attendance" className="text-sm text-fyh-accent underline">
              Open attendance
            </Link>
          </div>
          <p className="mt-2 text-sm text-fyh-text-secondary">
            Mark your daily presence from the Attendance page. Location is verified at the office.
          </p>
        </section>

        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <p className="text-sm text-fyh-text-secondary">My revenue (this month)</p>
          <p className="mt-1 text-2xl font-semibold">
            ₹{(ownRevenuePaise / 100).toLocaleString('en-IN')}
          </p>
        </section>

        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <h2 className="text-lg font-medium">Working hours</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {dash.schedule.length === 0 ? (
              <li className="text-fyh-text-secondary">No schedule set yet.</li>
            ) : (
              dash.schedule
                .slice()
                .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                .map((d) => (
                  <li key={d.id}>
                    {DAY_LABELS[d.dayOfWeek] ?? `Day ${d.dayOfWeek}`}:{' '}
                    {d.isOff ? 'Off' : `${d.startTime} – ${d.endTime}`}
                  </li>
                ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <h2 className="text-lg font-medium">My work</h2>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            {dash.grants?.permissions.includes('appointments.view_own') ? (
              <Link href="/appointments" className="text-fyh-accent underline">
                My appointments
              </Link>
            ) : null}
            <Link href="/attendance" className="text-fyh-accent underline">
              Attendance
            </Link>
            <Link
              href={`/staff/${session.workforceEmployeeId}/performance`}
              className="text-fyh-accent underline"
            >
              My performance
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
