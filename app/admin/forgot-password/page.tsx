import { Suspense } from 'react';
import { AdminLoginShell } from '@/src/components/brand/apg-os/AdminLoginShell';
import { AdminForgotPasswordForm } from '@/src/components/auth/AdminForgotPasswordForm';
import { getAdminRecoveryConfig } from '@/src/lib/auth/adminPasswordReset';

export const metadata = {
  title: 'Forgot password',
};

export default function AdminForgotPasswordPage() {
  const recovery = getAdminRecoveryConfig();

  return (
    <AdminLoginShell>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <AdminForgotPasswordForm
          recoveryConfigured={recovery.configured}
          maskedRecoveryEmail={recovery.maskedRecoveryEmail}
        />
      </Suspense>
    </AdminLoginShell>
  );
}
