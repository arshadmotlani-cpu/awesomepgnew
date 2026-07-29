import { Suspense } from 'react';
import { AdminLoginShell } from '@/src/components/brand/apg-os/AdminLoginShell';
import { AdminResetPasswordForm } from '@/src/components/auth/AdminResetPasswordForm';

export const metadata = {
  title: 'Reset password',
};

export default function AdminResetPasswordPage() {
  return (
    <AdminLoginShell>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <AdminResetPasswordForm />
      </Suspense>
    </AdminLoginShell>
  );
}
