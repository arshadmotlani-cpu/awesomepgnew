import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { getEmployeeDashboard } from '@/src/workforce/brains/employeeBrain';
import { clockInAction, clockOutAction } from '@/src/workforce/actions/operations';
import { getCompensationSnapshot, listIncentives } from '@/src/workforce/services/compensation';
import { normalizeCommissionType } from '@/src/workforce/lib/compensationMath';
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

  const salaryInr = (dash.employee.salaryPaise / 100).toLocaleString('en-IN');
  const accessRoleLabel = dash.membership
    ? workforceAccessRoleLabel(dash.membership.jobRole)
    : 'Team member';
  const today = new Date().toISOString().slice(0, 10);
  const todayAttendance = dash.recentAttendance.find((a) => a.workDate === today);
  const compensation = await getCompensationSnapshot(session.workforceEmployeeId, 'fyh_salon');
  const commissionType = normalizeCommissionType(compensation?.commission.type);
  const incentives = await listIncentives({
    employeeId: session.workforceEmployeeId,
    engineId: 'fyh_salon',
    limit: 20,
  });

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

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
            <p className="text-sm text-fyh-text-secondary">Salary</p>
            <p className="mt-1 text-2xl font-semibold">₹{salaryInr}</p>
          </div>
          <div className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
            <p className="text-sm text-fyh-text-secondary">My revenue (this month)</p>
            <p className="mt-1 text-2xl font-semibold">
              ₹{(ownRevenuePaise / 100).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
            <p className="text-sm text-fyh-text-secondary">Commission</p>
            <p className="mt-1 text-lg font-semibold capitalize">
              {commissionType === 'none'
                ? 'None'
                : commissionType === 'fixed'
                  ? `₹${((compensation?.commission.fixedPaise ?? 0) / 100).toLocaleString('en-IN')} fixed`
                  : `${((compensation?.commission.percentBps ?? 0) / 100).toFixed(2)}%`}
            </p>
          </div>
          <div className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
            <p className="text-sm text-fyh-text-secondary">Performance target</p>
            <p className="mt-1 text-2xl font-semibold">
              ₹{((compensation?.performanceTargetPaise ?? 0) / 100).toLocaleString('en-IN')}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">My incentives</h2>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {incentives.length === 0 ? (
              <li className="text-fyh-text-secondary">No incentives yet.</li>
            ) : (
              incentives.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>
                    {i.label} · {i.effectiveDate}
                  </span>
                  <span className="text-fyh-text-secondary">
                    ₹{(i.amountPaise / 100).toLocaleString('en-IN')} · {i.status}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Attendance today</h2>
            <div className="flex gap-2">
              <form action={clockInAction}>
                <button
                  type="submit"
                  className="rounded-lg border border-[color:var(--fyh-border)] px-3 py-1.5 text-sm"
                  disabled={Boolean(todayAttendance?.clockInAt)}
                >
                  Clock in
                </button>
              </form>
              <form action={clockOutAction}>
                <button
                  type="submit"
                  className="rounded-lg border border-[color:var(--fyh-border)] px-3 py-1.5 text-sm"
                  disabled={!todayAttendance?.clockInAt || Boolean(todayAttendance?.clockOutAt)}
                >
                  Clock out
                </button>
              </form>
            </div>
          </div>
          <p className="mt-2 text-sm text-fyh-text-secondary">
            {todayAttendance
              ? `${todayAttendance.status}${todayAttendance.clockInAt ? ` · in ${new Date(todayAttendance.clockInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}${todayAttendance.clockOutAt ? ` · out ${new Date(todayAttendance.clockOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}`
              : 'Not clocked in yet.'}
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {dash.recentAttendance.length === 0 ? (
              <li className="text-fyh-text-secondary">No recent attendance.</li>
            ) : (
              dash.recentAttendance.slice(0, 7).map((a) => (
                <li key={a.id}>
                  {a.workDate}: {a.status}
                </li>
              ))
            )}
          </ul>
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
