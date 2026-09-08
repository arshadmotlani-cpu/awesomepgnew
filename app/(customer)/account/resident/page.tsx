import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PostLoginRouteObserver } from '@/src/components/customer/account/PostLoginRouteObserver';
import { ResidentAccountIncompletePanel } from '@/src/components/customer/account/ResidentAccountIncompletePanel';
import { ResidentPortalCoreErrorPanel } from '@/src/components/customer/account/ResidentPortalCoreErrorPanel';
import { ResidentStaySection } from '@/src/components/customer/account/ResidentStaySection';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  legacyStaySubFromTab,
  legacySubFromTab,
  parseResidentPaymentsSub,
  parseResidentStaySub,
  residentPaymentsHref,
  residentStayHref,
  residentTabHref,
} from '@/src/lib/accountNavigation';
import { normalizeRequestCategoryId } from '@/src/lib/residents/requestCenter';
import { loadResidentAccountContextSafe } from '@/src/services/residentAccountContextSafe';
import { logger } from '@/src/lib/logger';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'My Stay',
  description: 'Your current stay, payments, requests, and wallet.',
};

export default async function ResidentMyStayPage(props: PageProps<'/account/resident'>) {
  const session = await requireCustomerSession('/account/resident');
  const contextLoad = await loadResidentAccountContextSafe(session.customerId, session.email);

  if (!contextLoad.ok) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <PostLoginRouteObserver
          step="account_resident_context_failed"
          customerId={session.customerId}
          email={session.email}
          extra={{ reason: contextLoad.reason, error: contextLoad.errorMessage }}
        />
        {contextLoad.reason === 'not_found' ? (
          <p className="text-sm text-rose-700">Account not found.</p>
        ) : contextLoad.reason === 'incomplete' ? (
          <ResidentAccountIncompletePanel />
        ) : (
          <ResidentPortalCoreErrorPanel />
        )}
      </main>
    );
  }

  const ctx = contextLoad.ctx;
  const sp = await props.searchParams;
  const tabParam = typeof sp.tab === 'string' ? sp.tab : undefined;
  const subParam = typeof sp.sub === 'string' ? sp.sub : undefined;
  const payParam = typeof sp.pay === 'string' ? sp.pay : undefined;
  const categoryRaw = typeof sp.category === 'string' ? sp.category : undefined;

  // Legacy deep links → canonical My Stay routes.
  if (tabParam === 'home') redirect(residentStayHref('overview'));
  if (tabParam === 'wallet') redirect(residentStayHref('wallet'));
  if (tabParam === 'room' || tabParam === 'notifications') redirect(residentStayHref('overview'));
  if (tabParam === 'profile') redirect('/account/profile');
  if (tabParam === 'vacating') redirect(residentTabHref('requests', { category: 'move_out' }));
  if (tabParam === 'requests') {
    const qs = categoryRaw ? `?sub=requests&category=${encodeURIComponent(categoryRaw)}` : '?sub=requests';
    redirect(`/account/resident${qs}`);
  }
  if (tabParam === 'invoices') redirect(residentPaymentsHref('invoices'));
  if (tabParam === 'payments') {
    const legacy = legacySubFromTab(tabParam);
    if (legacy.paymentsSub === 'invoices') redirect(residentPaymentsHref('invoices'));
    redirect(residentPaymentsHref(parseResidentPaymentsSub(subParam ?? payParam)));
  }
  if (tabParam === 'referrals') redirect(residentTabHref('referrals'));
  if (tabParam === 'concierge') redirect(residentTabHref('concierge'));
  if (subParam === 'due') redirect(residentPaymentsHref('due'));
  if (subParam === 'invoices') redirect(residentPaymentsHref('invoices'));
  if (subParam === 'history') redirect(residentPaymentsHref('history'));

  const staySub = parseResidentStaySub(subParam ?? legacyStaySubFromTab(tabParam));
  const paymentsSub = parseResidentPaymentsSub(payParam ?? subParam);
  const requestCategory = categoryRaw ? normalizeRequestCategoryId(categoryRaw) : undefined;

  logger.info('post-login my stay routing', {
    customerId: session.customerId,
    email: session.email,
    staySub,
    paymentsSub,
    hasConfirmedBooking: ctx.hasConfirmedBooking,
    primaryBookingId: ctx.primaryBooking?.bookingId ?? null,
  });

  return (
    <main className="apg-resident-portal-main mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <PostLoginRouteObserver
        step="account_resident_my_stay"
        customerId={session.customerId}
        email={session.email}
        extra={{ staySub, paymentsSub }}
      />
      <header className="apg-resident-page-header mb-5 max-md:mb-6">
        <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <Link href="/account/bookings" className="text-apg-cyan hover:text-apg-orange">
            Bookings
          </Link>
          <span className="text-apg-muted" aria-hidden>
            /
          </span>
          <span className="text-apg-silver" aria-current="page">
            My Stay
          </span>
        </nav>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">My Stay</h1>
        <p className="mt-1 text-sm text-apg-silver">Your money and current stay.</p>
      </header>
      <ResidentStaySection
        preloaded={ctx}
        customerId={session.customerId}
        staySub={staySub}
        paymentsSub={staySub === 'payments' ? paymentsSub : 'due'}
        requestsQuery={{
          requestId: typeof sp.request === 'string' ? sp.request : undefined,
          make: sp.make === '1' || categoryRaw === 'move_out',
          category: requestCategory ?? undefined,
        }}
      />
    </main>
  );
}
