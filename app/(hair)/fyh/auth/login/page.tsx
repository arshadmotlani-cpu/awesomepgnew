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

export default async function HairLoginRoute({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getHairSession();
  if (session) {
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
