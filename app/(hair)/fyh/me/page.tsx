import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { getEmployeeDashboard } from '@/src/workforce/brains/employeeBrain';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import { logoutAction } from '@/src/hair/actions/auth';

export default async function TeamMemberMePage() {
  await requireHairHost();
  if (!isWorkforceEngineEnabled()) redirect('/dashboard');

  const session = await getHairSession();
  if (!session?.workforceEmployeeId) redirect('/login');

  const dash = await getEmployeeDashboard(session.workforceEmployeeId, 'fyh_salon');
  if (!dash) redirect('/login');

  const salaryInr = (dash.employee.salaryPaise / 100).toLocaleString('en-IN');

  return (
    <div className="min-h-screen bg-[color:var(--fyh-bg)] px-4 py-8 text-fyh-text">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-fyh-text-secondary">My workspace</p>
            <h1 className="text-3xl font-semibold">{dash.employee.fullName}</h1>
            <p className="text-sm text-fyh-text-secondary">
              {dash.membership?.jobRole ?? 'team member'} · {dash.employee.mobile ?? 'no mobile'}
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
            <p className="text-sm text-fyh-text-secondary">Receive bookings</p>
            <p className="mt-1 text-2xl font-semibold">
              {dash.grants?.permissions.includes('appointments.receive_bookings') ? 'Yes' : 'No'}
            </p>
          </div>
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
                    Day {d.dayOfWeek}:{' '}
                    {d.isOff ? 'Off' : `${d.startTime} – ${d.endTime}`}
                  </li>
                ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <h2 className="text-lg font-medium">Attendance</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {dash.recentAttendance.length === 0 ? (
              <li className="text-fyh-text-secondary">No attendance rows yet (foundation).</li>
            ) : (
              dash.recentAttendance.map((a) => (
                <li key={a.id}>
                  {a.workDate}: {a.status}
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <h2 className="text-lg font-medium">Overview</h2>
          <p className="mt-2 text-sm text-fyh-text-secondary">
            Your appointments, personal revenue, commission, and targets will appear here as Salon
            adapters feed the Employee Brain. This portal never shows business-wide revenue, other
            staff, expenses, inventory, or settings.
          </p>
          {dash.grants?.permissions.includes('appointments.view_own') ? (
            <p className="mt-4">
              <Link href="/appointments" className="text-fyh-accent underline">
                View my appointments
              </Link>
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
