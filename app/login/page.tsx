import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteFooter } from '@/src/components/customer/SiteFooter';
import { SiteHeader } from '@/src/components/customer/SiteHeader';
import { WhatsAppSupportButton } from '@/src/components/customer/WhatsAppSupportButton';
import { CustomerLoginForm } from '@/src/components/auth/CustomerLoginForm';
import { AwesomePgLogo } from '@/src/components/brand/AwesomePgLogo';
import { bootstrapLoginPage } from '@/src/lib/auth/loginBootstrap';
import { getCustomerSession } from '@/src/lib/auth/session';
import { safeNext } from '@/src/lib/auth/safeNext';

export const metadata = {
  title: 'Login',
  description: 'Login to Awesome PG — book beds, pay rent, and manage your resident life.',
};

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ signup?: string; email?: string; notice?: string; next?: string }>;
}) {
  const params = await searchParams;
  const signupMode = params.signup === '1';

  // Already logged in — never strand residents on an empty Login form.
  if (!signupMode) {
    const session = await getCustomerSession();
    if (session) {
      if (session.mustSetPassword) {
        redirect(`/account/set-password?next=${encodeURIComponent(safeNext(params.next))}`);
      }
      redirect(safeNext(params.next));
    }
  }

  const boot = signupMode
    ? { email: params.email?.trim() || undefined }
    : await bootstrapLoginPage();

  return (
    <div className="apg-aurora apg-grid-overlay flex min-h-screen flex-col bg-apg-charcoal text-[#f4f6f8]">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-12 sm:px-6">
        <Link href="/pgs" className="text-xs font-medium text-apg-silver hover:text-apg-orange">
          ← Back to browse PGs
        </Link>
        <div className="mt-6 apg-glass rounded-2xl p-6 sm:p-8">
          <AwesomePgLogo size={56} priority className="mb-4 shadow-md shadow-orange-500/25" />
          <h1 className="text-xl font-semibold text-white">
            {signupMode ? 'Sign Up' : 'Login'}
          </h1>
          <p className="mt-2 text-sm text-apg-silver">
            {signupMode
              ? 'Create your resident account. If you already have one, we will guide you to Login.'
              : 'Login with your email or mobile number and password to book a bed, pay rent, or manage your resident dashboard. Email codes are only used when you Sign Up or forget your password.'}
          </p>
          <div className="mt-6">
            <Suspense fallback={<p className="text-sm text-apg-silver">Loading…</p>}>
              <CustomerLoginForm
                theme="dark"
                signupMode={signupMode}
                initialEmail={boot.email ?? params.email?.trim()}
                initialMessage={boot.message}
              />
            </Suspense>
          </div>
        </div>
      </main>
      <SiteFooter />
      <WhatsAppSupportButton />
    </div>
  );
}
