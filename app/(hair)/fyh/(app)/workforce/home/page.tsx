import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { logoutAction } from '@/src/hair/actions/auth';
import {
  getEmployeeDashboard,
  listEmployeesForEngine,
} from '@/src/workforce/brains/employeeBrain';
import { getOwnerWorkforceDashboard } from '@/src/workforce/connectors/ownerBridge';
import {
  MANAGER_NAV,
  OWNER_NAV,
  STAFF_NAV,
  type RoleNavLink,
  workforceHomePathForRank,
} from '@/src/workforce/dashboards/roleHome';
import { workforceJobRoleLabel, workforceRankLabel } from '@/src/workforce/labels';
import { hasWorkforcePermission } from '@/src/workforce/permissions/presets';
import { isWorkforceEngineEnabled, type WorkforcePermissionKey } from '@/src/workforce/types';

function filterNav(
  links: RoleNavLink[],
  permissions: WorkforcePermissionKey[] | undefined,
): RoleNavLink[] {
  return links.filter((l) => {
    if (!l.permission) return true;
    if (!permissions) return false;
    return hasWorkforcePermission(
      { permissions, maxBackdateDays: 0 },
      l.permission as WorkforcePermissionKey,
    );
  });
}

export default async function WorkforceRoleHomePage() {
  await requireHairHost();
  if (!isWorkforceEngineEnabled()) redirect('/dashboard');

  const session = await getHairSession();
  if (!session?.workforceEmployeeId) redirect('/login');

  const dash = await getEmployeeDashboard(session.workforceEmployeeId, 'fyh_salon');
  if (!dash?.membership) redirect('/login');

  const rank = dash.membership.rank;
  if (rank === 'team_member') {
    redirect(workforceHomePathForRank(rank));
  }

  const perms = dash.grants?.permissions ?? [];
  const nav =
    rank === 'owner'
      ? filterNav(OWNER_NAV, perms)
      : rank === 'manager'
        ? filterNav(MANAGER_NAV, perms)
        : filterNav(STAFF_NAV, perms);

  const team =
    rank === 'owner' || rank === 'manager'
      ? await listEmployeesForEngine('fyh_salon', { activeOnly: true })
      : [];

  const ecosystem =
    rank === 'owner' || rank === 'manager'
      ? await getOwnerWorkforceDashboard('fyh_salon')
      : null;

  const title = rank === 'owner' ? 'Owner dashboard' : 'Manager dashboard';

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-fyh-text-secondary">{title}</p>
          <h1 className="text-3xl font-semibold text-fyh-text">{dash.employee.fullName}</h1>
          <p className="text-sm text-fyh-text-secondary">
            {workforceRankLabel(rank)} · {workforceJobRoleLabel(dash.membership.jobRole)}
            {dash.employee.mobile ? ` · ${dash.employee.mobile}` : ''}
          </p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-fyh-accent underline">
            Sign out
          </button>
        </form>
      </header>

      {ecosystem ? (
        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <h2 className="text-lg font-medium text-fyh-text">Ecosystem connections</h2>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Workforce Brain linked to Finance, Appointment, Customer, Owner — Health Brain stays
            Baseline-frozen (self-check only).
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-[color:var(--fyh-border)] px-3 py-3 text-sm">
              <p className="text-fyh-text-secondary">Team</p>
              <p className="text-xl font-semibold text-fyh-text">{ecosystem.teamSize}</p>
              <p className="text-xs text-fyh-text-secondary">
                {ecosystem.owners} owner · {ecosystem.managers} manager · {ecosystem.staff} staff
              </p>
            </div>
            <div className="rounded-xl border border-[color:var(--fyh-border)] px-3 py-3 text-sm">
              <p className="text-fyh-text-secondary">Bookable (Appointments)</p>
              <p className="text-xl font-semibold text-fyh-text">
                {ecosystem.appointments.bookableCount}
              </p>
            </div>
            <div className="rounded-xl border border-[color:var(--fyh-border)] px-3 py-3 text-sm">
              <p className="text-fyh-text-secondary">Salary liability</p>
              <p className="text-xl font-semibold text-fyh-text">
                ₹{(ecosystem.finance.monthlySalaryLiabilityPaise / 100).toLocaleString('en-IN')}
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {ecosystem.connections.map((c) => (
              <li
                key={c.brain}
                className="flex flex-wrap items-baseline justify-between gap-2 border-t border-[color:var(--fyh-border)] pt-2"
              >
                <span className="font-medium capitalize text-fyh-text">{c.brain} Brain</span>
                <span className="text-fyh-text-secondary">
                  {c.status.replaceAll('_', ' ')} — {c.detail}
                </span>
              </li>
            ))}
          </ul>
          {ecosystem.attention.length > 0 ? (
            <ul className="mt-4 space-y-1 text-sm text-fyh-text-secondary">
              {ecosystem.attention.map((a, i) => (
                <li key={`${a.kind}-${i}`}>
                  {a.severity === 'warn' ? '⚠ ' : '• '}
                  {a.message}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fyh-text-secondary">
          Quick links
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] px-4 py-4 text-fyh-text transition hover:border-fyh-accent/40"
            >
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {team.length > 0 ? (
        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-fyh-text">Team ({team.length})</h2>
            {hasWorkforcePermission(dash.grants, 'staff.add') ? (
              <Link href="/workforce" className="text-sm text-fyh-accent underline">
                Manage workforce
              </Link>
            ) : null}
          </div>
          <ul className="mt-4 divide-y divide-[color:var(--fyh-border)] text-sm">
            {team.slice(0, 12).map((row) => (
              <li key={row.employee.id} className="flex justify-between gap-3 py-2">
                <span className="font-medium text-fyh-text">{row.employee.fullName}</span>
                <span className="text-fyh-text-secondary">
                  {workforceRankLabel(row.membership.rank)} ·{' '}
                  {workforceJobRoleLabel(row.membership.jobRole)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-fyh-text-secondary">
        You only see modules your Workforce permissions allow. Settings and profit are Owner-scoped
        by default.
      </p>
    </div>
  );
}
