import { Suspense } from 'react';
import { AdminLoginShell } from '@/src/components/brand/apg-os/AdminLoginShell';
import { AdminLoginForm } from '@/src/components/auth/AdminLoginForm';
import { getAdminRecoveryConfig } from '@/src/lib/auth/adminPasswordReset';

export const metadata = {
  title: 'Sign in',
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
    <AdminLoginShell>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <AdminLoginForm
          recoveryConfigured={recovery.configured}
          maskedRecoveryEmail={recovery.maskedRecoveryEmail}
          passwordResetSuccess={sp.reset === '1'}
        />
      </Suspense>
    </AdminLoginShell>
  );
}
