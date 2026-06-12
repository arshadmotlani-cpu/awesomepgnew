import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AdminChangePasswordForm } from '@/src/components/auth/AdminChangePasswordForm';
import { requireAdminSession } from '@/src/lib/auth/guards';

export const metadata = {
  title: 'Change password · Admin · Awesome PG',
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
    <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 px-4 py-8 text-zinc-900 scheme-light pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <AdminChangePasswordForm email={session.email} />
      </Suspense>
    </div>
  );
}
