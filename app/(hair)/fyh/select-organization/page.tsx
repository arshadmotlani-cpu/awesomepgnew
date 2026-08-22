import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfEmployees } from '@/src/workforce/db/schema';
import { selectOrganizationAction } from '@/src/hair/actions/tenant';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { FYH_LOCATION_COOKIE, FYH_ORG_COOKIE } from '@/src/hair/lib/tenant/cookies';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import {
  decideSelectOrganizationNavigation,
  isPersistedTenantSelection,
  pickResolvableMembership,
} from '@/src/hair/lib/tenant/selectOrganizationNav';
import { listActiveMembershipsForUser } from '@/src/platform/services/memberships';
import { Button } from '@/src/hair/components/ui/button';

export default async function SelectOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; nobind?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? '/dashboard/revenue';
  const homePath =
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.startsWith('/select-organization') &&
    next !== '/login'
      ? next
      : '/dashboard/revenue';

  if (!isFyhSaasTenantEnabled()) {
    redirect('/dashboard/revenue');
  }

  await requireHairHost();
  const session = await getHairSession();
  const ctx = session ? await getTenantContextForPage() : null;
  const cookieStore = await cookies();
  const orgCookie = cookieStore.get(FYH_ORG_COOKIE)?.value ?? null;
  const locCookie = cookieStore.get(FYH_LOCATION_COOKIE)?.value ?? null;
  const selectionPersisted = isPersistedTenantSelection(ctx, orgCookie, locCookie);
  const nav = decideSelectOrganizationNavigation({
    sessionPresent: Boolean(session),
    tenantResolved: Boolean(ctx),
    selectionPersisted,
    homePath,
  });
  if (nav.action === 'redirect') redirect(nav.to);

  if (!session?.workforceEmployeeId) {
    return (
      <SelectOrgShell title="Choose organization">
        <p className="mt-2 text-sm text-fyh-text-secondary">
          Your salon login is active, but this account is not linked to a workforce employee yet.
          Organization context cannot be selected until that link exists.
        </p>
      </SelectOrgShell>
    );
  }

  const [emp] = await hairDb
    .select({ userId: wfEmployees.userId })
    .from(wfEmployees)
    .where(eq(wfEmployees.id, session.workforceEmployeeId))
    .limit(1);

  if (!emp?.userId) {
    return (
      <SelectOrgShell title="Choose organization">
        <p className="mt-2 text-sm text-fyh-text-secondary">
          This employee is not linked to a platform user, so organizations cannot be loaded.
        </p>
      </SelectOrgShell>
    );
  }

  const memberships = await listActiveMembershipsForUser(emp.userId);
  const single = pickResolvableMembership(memberships, orgCookie);
  const resolvableCount = memberships.filter((m) => m.allowedLocationIds.length > 0).length;
  if (
    params.nobind !== '1' &&
    !selectionPersisted &&
    resolvableCount === 1 &&
    single?.allowedLocationIds[0]
  ) {
    const bind = new URLSearchParams();
    bind.set('next', homePath);
    redirect(`/select-organization/bind?${bind.toString()}`);
  }

  return (
    <SelectOrgShell title="Select organization">
      <p className="mt-2 text-sm text-fyh-text-secondary">
        Choose which salon organization you want to manage in this session.
      </p>
      {params.error ? (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          Could not select that organization. Try again.
        </p>
      ) : null}
      {memberships.length === 0 ? (
        <p className="mt-4 text-sm text-fyh-text-secondary">
          No active salon organizations are available for this account.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {memberships.map((membership) => (
            <form key={membership.organizationId} action={selectOrganizationAction}>
              <input type="hidden" name="organizationId" value={membership.organizationId} />
              <input type="hidden" name="next" value={homePath} />
              <Button type="submit" variant="secondary" className="h-auto w-full justify-start px-4 py-4">
                <span className="flex flex-col items-start gap-1">
                  <span className="font-medium text-fyh-text">{membership.organizationName}</span>
                  <span className="text-xs capitalize text-fyh-text-secondary">
                    {membership.role}
                  </span>
                </span>
              </Button>
            </form>
          ))}
        </div>
      )}
    </SelectOrgShell>
  );
}

function SelectOrgShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center">
      <div className="fyh-glass rounded-2xl p-8">
        <h1 className="fyh-display text-2xl font-semibold text-fyh-text">{title}</h1>
        {children}
      </div>
    </div>
  );
}
