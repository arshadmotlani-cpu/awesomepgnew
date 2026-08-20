import { Suspense } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPlatformAuthOptional } from '@/src/platform/lib/auth/guards';
import PlatformLoginForm from './login-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Platform sign in · Awesome PG',
};

export default async function PlatformLoginPage() {
  await headers();
  const session = await getPlatformAuthOptional();
  if (session) redirect('/platform/dashboard');

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 text-slate-400">
          Loading…
        </div>
      }
    >
      <PlatformLoginForm />
    </Suspense>
  );
}
