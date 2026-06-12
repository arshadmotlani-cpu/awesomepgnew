import { Suspense } from 'react';
import { AdminForgotPasswordForm } from '@/src/components/auth/AdminForgotPasswordForm';
import { getAdminRecoveryConfig } from '@/src/lib/auth/adminPasswordReset';

export const metadata = {
  title: 'Forgot password · Admin · Awesome PG',
};

export default function AdminForgotPasswordPage() {
  const recovery = getAdminRecoveryConfig();

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 px-4 py-8 text-zinc-900 scheme-light pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <AdminForgotPasswordForm
          recoveryConfigured={recovery.configured}
          maskedRecoveryEmail={recovery.maskedRecoveryEmail}
        />
      </Suspense>
    </div>
  );
}
