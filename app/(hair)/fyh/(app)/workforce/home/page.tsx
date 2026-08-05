import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { logoutAction } from '@/src/hair/actions/auth';
import {
  getEmployeeDashboard,
  listEmployeesForEngine,
} from '@/src/workforce/brains/employeeBrain';
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
