import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import HairLoginPage from './page-client';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { HAIR_SESSION_COOKIE } from '@/src/hair/lib/auth/constants';
import {
  resolveDefaultLandingPath,
  safeHairNextPath,
} from '@/src/hair/lib/auth/guards';
import { hairAppRedirect } from '@/src/hair/lib/host';
import { FYH_LOCATION_COOKIE, FYH_ORG_COOKIE } from '@/src/hair/lib/tenant/cookies';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { isPersistedTenantSelection } from '@/src/hair/lib/tenant/selectOrganizationNav';

export default async function HairLoginRoute({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getHairSession();
  if (session) {
    if (isFyhSaasTenantEnabled()) {
      const ctx = await getTenantContextForPage();
      const cookieStore = await cookies();
      const persisted = isPersistedTenantSelection(
        ctx,
        cookieStore.get(FYH_ORG_COOKIE)?.value,
        cookieStore.get(FYH_LOCATION_COOKIE)?.value,
      );
      if (!persisted) {
        redirect(await hairAppRedirect('/select-organization?nobind=1'));
      }
    }
    const params = await searchParams;
    const next = params.next?.trim();
    const dest = next
      ? safeHairNextPath(next, session.admin)
      : resolveDefaultLandingPath(session.admin);
    redirect(await hairAppRedirect(dest));
  }

  const cookieStore = await cookies();
  if (cookieStore.get(HAIR_SESSION_COOKIE)?.value) {
    cookieStore.delete(HAIR_SESSION_COOKIE);
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-fyh-text-secondary">
          Loading…
        </div>
      }
    >
      <HairLoginPage />
    </Suspense>
  );
}
