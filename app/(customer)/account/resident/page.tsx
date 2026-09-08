import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PostLoginRouteObserver } from '@/src/components/customer/account/PostLoginRouteObserver';
import { ResidentAccountIncompletePanel } from '@/src/components/customer/account/ResidentAccountIncompletePanel';
import { ResidentPortalCoreErrorPanel } from '@/src/components/customer/account/ResidentPortalCoreErrorPanel';
import { ResidentStaySection } from '@/src/components/customer/account/ResidentStaySection';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  legacyStaySubFromTab,
  parseResidentStaySub,
  residentStayHref,
  residentTabHref,
} from '@/src/lib/accountNavigation';
import { loadResidentAccountContextSafe } from '@/src/services/residentAccountContextSafe';
import { logger } from '@/src/lib/logger';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'My Stay',
  description: 'Your current stay, payments, wallet, and bills due.',
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

  // Legacy deep links → canonical My Stay sub-routes.
  if (tabParam === 'home') redirect(residentStayHref('overview'));
  if (tabParam === 'wallet') redirect(residentStayHref('wallet'));
  if (tabParam === 'room' || tabParam === 'notifications') redirect(residentStayHref('overview'));
  if (tabParam === 'payments') {
    redirect(residentStayHref(parseResidentStaySub(subParam ?? legacyStaySubFromTab(tabParam))));
  }
  if (tabParam === 'profile') redirect('/account/profile');
  if (tabParam === 'vacating') redirect(residentTabHref('requests', { category: 'move_out' }));
  if (tabParam === 'requests') redirect(residentTabHref('requests'));
  if (tabParam === 'invoices') redirect(residentTabHref('invoices'));
  if (tabParam === 'referrals') redirect(residentTabHref('referrals'));
  if (tabParam === 'concierge') redirect(residentTabHref('concierge'));

  const staySub = parseResidentStaySub(subParam ?? legacyStaySubFromTab(tabParam));

  logger.info('post-login my stay routing', {
    customerId: session.customerId,
    email: session.email,
    staySub,
    hasConfirmedBooking: ctx.hasConfirmedBooking,
    primaryBookingId: ctx.primaryBooking?.bookingId ?? null,
  });

  return (
    <main className="apg-resident-portal-main mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <PostLoginRouteObserver
        step="account_resident_my_stay"
        customerId={session.customerId}
        email={session.email}
        extra={{ staySub }}
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
      <ResidentStaySection preloaded={ctx} customerId={session.customerId} staySub={staySub} />
    </main>
  );
}
