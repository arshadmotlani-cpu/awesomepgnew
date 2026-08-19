import Link from 'next/link';
import { platformLogoutAction } from '@/src/platform/actions/auth';
import { requirePlatformAuthPage } from '@/src/platform/lib/auth/guards';
import { listOrganizationMembershipsForUser } from '@/src/platform/services/organizations';

export default async function PlatformDashboardPage() {
  const session = await requirePlatformAuthPage();
  const orgMemberships = await listOrganizationMembershipsForUser(session.userId);

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Platform</p>
            <h1 className="text-lg font-semibold">Dashboard</h1>
          </div>
          <form action={platformLogoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-base font-semibold">Signed in as</h2>
          <p className="mt-2 text-sm text-slate-300">{session.email}</p>
          <p className="mt-1 text-xs text-slate-500">
            {session.isPlatformAdmin ? 'Platform administrator' : 'Organization member'}
          </p>
        </section>

        {session.isPlatformAdmin ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Platform administration</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Manage organizations, plans, and platform access.
                </p>
              </div>
              <Link
                href="/platform/admin"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Open Platform Admin
              </Link>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-base font-semibold">Your organizations</h2>
          {orgMemberships.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              No organization memberships yet. Bootstrap staging or ask a platform admin to invite
              you.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {orgMemberships.map((org) => (
                <li
                  key={org.organizationId}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{org.organizationName}</p>
                    <p className="text-xs text-slate-500">
                      {org.role} · {org.locationNames.join(', ') || 'No locations'}
                    </p>
                  </div>
                  <Link
                    href="/fyh/auth/login"
                    className="text-sm text-emerald-400 hover:underline"
                  >
                    Open salon app
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
