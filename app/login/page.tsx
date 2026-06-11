import { Suspense } from 'react';
import Link from 'next/link';
import { SiteFooter } from '@/src/components/customer/SiteFooter';
import { SiteHeader } from '@/src/components/customer/SiteHeader';
import { WhatsAppSupportButton } from '@/src/components/customer/WhatsAppSupportButton';
import { CustomerLoginForm } from '@/src/components/auth/CustomerLoginForm';

export const metadata = {
  title: 'Sign in',
  description: 'Sign in to Awesome PG — book beds, pay rent, and manage your resident life.',
};

export default function LoginPage() {
  return (
    <div className="apg-aurora apg-grid-overlay flex min-h-screen flex-col bg-apg-charcoal text-[#f4f6f8]">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-12 sm:px-6">
        <Link href="/pgs" className="text-xs font-medium text-apg-silver hover:text-apg-orange">
          ← Back to browse PGs
        </Link>
        <div className="mt-6 apg-glass rounded-2xl p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-white">Welcome back</h1>
          <p className="mt-2 text-sm text-apg-silver">
            Sign in to book a bed, pay rent, or manage your resident dashboard.
          </p>
          <div className="mt-6">
            <Suspense fallback={<p className="text-sm text-apg-silver">Loading…</p>}>
              <CustomerLoginForm theme="dark" />
            </Suspense>
          </div>
        </div>
      </main>
      <SiteFooter />
      <WhatsAppSupportButton />
    </div>
  );
}
