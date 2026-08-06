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
import { WORKFORCE_HUB_NAV, type RoleNavLink } from '@/src/workforce/dashboards/roleHome';
import { workforceAccessRoleLabel } from '@/src/workforce/labels';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';
import { isWorkforceEngineEnabled, type WorkforcePermissionKey } from '@/src/workforce/types';

function filterNav(
  links: RoleNavLink[],
  grants: { permissions: WorkforcePermissionKey[]; maxBackdateDays: number | null },
): RoleNavLink[] {
  return links.filter((l) => {
    if (!l.permission) return true;
    return hasWorkforcePermission(grants, l.permission as WorkforcePermissionKey);
  });
}

export default async function WorkforceRoleHomePage() {
  await requireHairHost();
  if (!isWorkforceEngineEnabled()) redirect('/dashboard');

  const session = await getHairSession();
  if (!session?.workforceEmployeeId) redirect('/login');

  const dash = await getEmployeeDashboard(session.workforceEmployeeId, 'fyh_salon');
  if (!dash?.membership || !dash.grants) redirect('/login');

  if (!hasWorkforcePermission(dash.grants, 'staff.view')) {
    redirect('/me');
  }

  const nav = filterNav(WORKFORCE_HUB_NAV, dash.grants);
  const team = hasWorkforcePermission(dash.grants, 'staff.view')
    ? await listEmployeesForEngine('fyh_salon', { activeOnly: true })
    : [];

  const ecosystem = hasWorkforcePermission(dash.grants, 'dashboard.view_revenue')
    ? await getOwnerWorkforceDashboard('fyh_salon')
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-fyh-text-secondary">Workforce hub</p>
          <h1 className="text-3xl font-semibold text-fyh-text">{dash.employee.fullName}</h1>
          <p className="text-sm text-fyh-text-secondary">
            {workforceAccessRoleLabel(dash.membership.jobRole)}
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
          <h2 className="text-lg font-medium text-fyh-text">Salon snapshot</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-fyh-text-secondary">Active team</dt>
              <dd className="text-2xl font-semibold text-fyh-text">{ecosystem.teamSize}</dd>
            </div>
            <div>
              <dt className="text-xs text-fyh-text-secondary">Bookable staff</dt>
              <dd className="text-2xl font-semibold text-fyh-text">{ecosystem.appointments.bookableCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-fyh-text-secondary">Roles</dt>
              <dd className="text-sm text-fyh-text">
                {`Owners: ${ecosystem.owners} · Managers: ${ecosystem.managers} · Staff: ${ecosystem.staff}`}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
        <h2 className="text-lg font-medium text-fyh-text">Quick links</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {nav.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-block rounded-lg border border-[color:var(--fyh-border)] px-3 py-2 text-sm text-fyh-accent hover:bg-[color:var(--fyh-surface-muted)]"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {team.length > 0 ? (
        <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-fyh-text">Team</h2>
            {hasWorkforcePermission(dash.grants, 'staff.edit') ? (
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
                  {workforceAccessRoleLabel(row.membership.jobRole)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-fyh-text-secondary">
        Modules shown are based on your effective permissions, not your job title.
      </p>
    </div>
  );
}
