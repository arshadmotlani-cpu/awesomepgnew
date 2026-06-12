import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { CustomerSetPasswordForm } from '@/src/components/auth/CustomerSetPasswordForm';
import { SiteFooter } from '@/src/components/customer/SiteFooter';
import { SiteHeader } from '@/src/components/customer/SiteHeader';
import { WhatsAppSupportButton } from '@/src/components/customer/WhatsAppSupportButton';
import { requireCustomerSession } from '@/src/lib/auth/guards';
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
  const session = await requireCustomerSession('/account/set-password', {
    allowPasswordSetup: true,
  });
  const sp = await searchParams;

  if (!session.mustSetPassword) {
    redirect(safeNext(sp.next));
  }

  return (
    <div className="apg-aurora apg-grid-overlay flex min-h-screen flex-col bg-apg-charcoal text-[#f4f6f8]">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-12 sm:px-6">
        <Link href="/pgs" className="text-xs font-medium text-apg-silver hover:text-apg-orange">
          ← Back to browse PGs
        </Link>
        <div className="mt-6 apg-glass rounded-2xl p-6 sm:p-8">
          <Suspense fallback={<p className="text-sm text-apg-silver">Loading…</p>}>
            <CustomerSetPasswordForm email={session.email} theme="dark" />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
      <WhatsAppSupportButton />
    </div>
  );
}
