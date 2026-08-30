import Link from 'next/link';
import { platformLogoutAction } from '@/src/platform/actions/auth';
import { requirePlatformAuthPage } from '@/src/platform/lib/auth/guards';
import { listOrganizationMembershipsForUser } from '@/src/platform/services/organizations';

type Props = { searchParams: Promise<{ error?: string }> };

export default async function PlatformDashboardPage({ searchParams }: Props) {
  const session = await requirePlatformAuthPage();
  const params = await searchParams;
  const orgMemberships = await listOrganizationMembershipsForUser(session.userId);
  const needsAdmin = params.error === 'platform_admin_required';

  return (
    <div className="plt-root min-h-[100dvh]">
      <header className="border-b border-[var(--plt-border)] bg-[var(--plt-bg-elevated)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--plt-text-subtle)]">Platform</p>
            <h1 className="text-lg font-semibold text-[var(--plt-text)]">Dashboard</h1>
          </div>
          <form action={platformLogoutAction}>
            <button type="submit" className="plt-btn-secondary">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {needsAdmin ? (
          <section className="plt-alert-warning p-6">
            <h2 className="text-base font-semibold">Platform admin required</h2>
            <p className="mt-2 text-sm opacity-90">
              That page (including salon onboarding) is only available to platform administrators.
              Ask an existing platform admin to grant you access under Users → Platform
              Administrators.
            </p>
          </section>
        ) : null}

        <section className="plt-card p-6">
          <h2 className="text-base font-semibold">Signed in as</h2>
          <p className="mt-2 text-sm text-[var(--plt-text-muted)]">{session.email}</p>
          <p className="mt-1 text-xs text-[var(--plt-text-subtle)]">
            {session.isPlatformAdmin ? 'Platform administrator' : 'Organization member'}
          </p>
        </section>

        {session.isPlatformAdmin ? (
          <section className="plt-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Platform administration</h2>
                <p className="mt-1 text-sm text-[var(--plt-text-muted)]">
                  Manage organizations, plans, and platform access.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/platform/admin/onboarding" className="plt-btn-secondary">
                  Create salon
                </Link>
                <Link href="/platform/admin" className="plt-btn-primary">
                  Open Platform Admin
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section className="plt-card p-6">
          <h2 className="text-base font-semibold">Your organizations</h2>
          {orgMemberships.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--plt-text-muted)]">
              No organization memberships yet. Bootstrap staging or ask a platform admin to invite
              you.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {orgMemberships.map((org) => (
                <li
                  key={org.organizationId}
                  className="flex items-center justify-between rounded-xl border border-[var(--plt-border)] bg-[var(--plt-bg-muted)] px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{org.organizationName}</p>
                    <p className="text-xs text-[var(--plt-text-subtle)]">
                      {org.role} · {org.locationNames.join(', ') || 'No locations'}
                    </p>
                  </div>
                  <Link
                    href="/fyh/auth/login"
                    className="text-sm text-[var(--plt-accent-hover)] hover:underline"
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
