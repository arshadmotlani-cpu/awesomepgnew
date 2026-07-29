import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AdminLoginShell } from '@/src/components/brand/apg-os/AdminLoginShell';
import { AdminChangePasswordForm } from '@/src/components/auth/AdminChangePasswordForm';
import { requireAdminSession } from '@/src/lib/auth/guards';

export const metadata = {
  title: 'Change password',
};

type SearchParams = { next?: string };

export default async function AdminChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireAdminSession(undefined, { allowPasswordChange: true });
  const sp = await searchParams;

  if (!session.mustChangePassword) {
    const dest = sp.next && sp.next.startsWith('/admin') ? sp.next : '/admin';
    redirect(dest);
  }

  return (
    <AdminLoginShell>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <AdminChangePasswordForm email={session.email} />
      </Suspense>
    </AdminLoginShell>
  );
}
