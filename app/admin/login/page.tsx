import { Suspense } from 'react';
import { AdminLoginForm } from '@/src/components/auth/AdminLoginForm';
import { getAdminRecoveryConfig } from '@/src/lib/auth/adminPasswordReset';

export const metadata = {
  title: 'Admin sign in · Awesome PG',
};

type SearchParams = { reset?: string };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const recovery = getAdminRecoveryConfig();
  const sp = await searchParams;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 px-4 py-8 text-zinc-900 scheme-light pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <AdminLoginForm
          recoveryConfigured={recovery.configured}
          maskedRecoveryEmail={recovery.maskedRecoveryEmail}
          passwordResetSuccess={sp.reset === '1'}
        />
      </Suspense>
    </div>
  );
}
