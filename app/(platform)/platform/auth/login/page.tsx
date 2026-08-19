import { Suspense } from 'react';
import type { Metadata } from 'next';
import PlatformLoginForm from './login-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Platform sign in · Awesome PG',
};

export default function PlatformLoginPage() {
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
