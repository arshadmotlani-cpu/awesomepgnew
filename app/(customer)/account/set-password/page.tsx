import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { CustomerSetPasswordForm } from '@/src/components/auth/CustomerSetPasswordForm';
import { SiteFooter } from '@/src/components/customer/SiteFooter';
import { SiteHeader } from '@/src/components/customer/SiteHeader';
import { WhatsAppSupportButton } from '@/src/components/customer/WhatsAppSupportButton';
import { getCustomerSession } from '@/src/lib/auth/session';
import { readSignupSessionFromRequest } from '@/src/lib/auth/signupSession';
import { safeNext } from '@/src/lib/auth/safeNext';

export const metadata = {
  title: 'Create password',
  description: 'Set a password for your Awesome PG account.',
};

type SearchParams = { next?: string };

export default async function CustomerSetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);

  const customerSession = await getCustomerSession();
  const signupSession = await readSignupSessionFromRequest();

  const canSetPassword =
    Boolean(customerSession?.mustSetPassword) ||
    Boolean(signupSession?.otpVerified && signupSession.profileSubmitted);

  if (customerSession && !customerSession.mustSetPassword && !signupSession?.profileSubmitted) {
    redirect(next);
  }

  if (!canSetPassword) {
    redirect(`/login?next=${encodeURIComponent('/account/set-password')}`);
  }

  const email = signupSession?.email ?? customerSession?.email ?? '';

  return (
    <div className="apg-aurora apg-grid-overlay flex min-h-screen flex-col bg-apg-charcoal text-[#f4f6f8]">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-12 sm:px-6">
        <Link href="/pgs" className="text-xs font-medium text-apg-silver hover:text-apg-orange">
          ← Back to browse PGs
        </Link>
        <div className="mt-6 apg-glass rounded-2xl p-6 sm:p-8">
          <Suspense fallback={<p className="text-sm text-apg-silver">Loading…</p>}>
            <CustomerSetPasswordForm email={email} theme="dark" />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
      <WhatsAppSupportButton />
    </div>
  );
}
