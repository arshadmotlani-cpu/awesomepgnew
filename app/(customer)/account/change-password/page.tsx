import Link from 'next/link';
import { Suspense } from 'react';
import { CustomerChangePasswordForm } from '@/src/components/auth/CustomerChangePasswordForm';
import { LogoutButton } from '@/src/components/auth/LogoutButton';
import {
  ACCOUNT_LINK_ON_DARK,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/accountStyles';
import { requireCustomerSession } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Change password' };

export default async function CustomerChangePasswordPage() {
  const session = await requireCustomerSession('/account/change-password');

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <nav className="apg-account-nav text-xs">
        <Link href="/account/profile">Profile</Link>
        <span className="mx-1">/</span>
        <span aria-current="page">Change password</span>
      </nav>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <h1 className={ACCOUNT_PAGE_TITLE}>Security</h1>
        <LogoutButton scope="customer" tone="dark" />
      </header>

      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-apg-silver">Loading…</p>}>
          <CustomerChangePasswordForm email={session.email} />
        </Suspense>
      </div>

      <p className="mt-6 text-sm text-apg-silver">
        <Link href="/account/profile" className={ACCOUNT_LINK_ON_DARK}>
          ← Back to profile
        </Link>
      </p>
    </main>
  );
}
