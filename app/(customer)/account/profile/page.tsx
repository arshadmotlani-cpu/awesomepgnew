import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { SimpleAccountHub } from '@/src/components/customer/simple/SimpleAccountHub';
import { ApplicationStatusTracker } from '@/src/components/customer/account/ApplicationStatusTracker';
import { DocumentsModule } from '@/src/components/customer/account/v2/DocumentsModule';
import { ResidentAreaSection } from '@/src/components/customer/account/ResidentAreaSection';
import { ResidentPageHeader } from '@/src/components/customer/account/resident/ResidentPageHeader';
import { ResidentSectionErrorBoundary } from '@/src/components/customer/account/resident/ResidentSectionErrorBoundary';
import { PostLoginRouteObserver } from '@/src/components/customer/account/PostLoginRouteObserver';
import { ResidentAccountIncompletePanel } from '@/src/components/customer/account/ResidentAccountIncompletePanel';
import { ResidentPortalCoreErrorPanel } from '@/src/components/customer/account/ResidentPortalCoreErrorPanel';
import {
  ResidentAccountProfileSection,
} from '@/src/components/customer/account/ResidentAreaAsyncSections';
import { ResidentProfileTabSkeleton } from '@/src/components/customer/account/ResidentPortalSkeletons';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  parseResidentPaymentsSub,
  parseResidentStaySub,
  parseResidentTab,
  residentStayHref,
  residentTabHref,
  type ResidentTab,
} from '@/src/lib/accountNavigation';
import { residentTabMeta } from '@/src/lib/residentNavigation';
import { normalizeRequestCategoryId } from '@/src/lib/residents/requestCenter';
import { formatIndianPhoneDisplay, indianLocalFromE164 } from '@/src/lib/phone';
import { loadResidentAccountContextSafe } from '@/src/services/residentAccountContextSafe';
import { logger } from '@/src/lib/logger';

function parseLegacyHubTab(
  value: string | undefined,
): 'profile' | 'stay' | 'payments' | 'invoices' {
  if (value === 'stay' || value === 'payments' || value === 'invoices') return value;
  return 'profile';
}

function isAccountFeatureTab(tab: ResidentTab | undefined, tabParam: string | undefined): boolean {
  if (tab === 'requests' || tab === 'invoices' || tab === 'referrals' || tab === 'concierge') {
    return true;
  }
  return (
    tabParam === 'requests' ||
    tabParam === 'invoices' ||
    tabParam === 'referrals' ||
    tabParam === 'concierge' ||
    tabParam === 'vacating'
  );
}

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My Account' };

export default async function ProfilePage(props: PageProps<'/account/profile'>) {
  const session = await requireCustomerSession('/account/profile');

  logger.info('post-login profile page session ok', {
    customerId: session.customerId,
    email: session.email,
    sessionId: session.sessionId,
  });

  const contextLoad = await loadResidentAccountContextSafe(session.customerId, session.email);

  if (!contextLoad.ok) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <PostLoginRouteObserver
          step="account_profile_context_failed"
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
  const next = typeof sp.next === 'string' ? sp.next : undefined;
  const bookingCode = typeof sp.booking === 'string' ? sp.booking : undefined;
  const submitted = sp.submitted === '1';
  const sectionRaw = typeof sp.section === 'string' ? sp.section : undefined;
  const explicitSettings = sp.settings === '1';

  const tabParam = typeof sp.tab === 'string' ? sp.tab : undefined;
  const subParam = typeof sp.sub === 'string' ? sp.sub : undefined;
  const residentTab = parseResidentTab(tabParam);
  const editExpanded = sp.edit === '1' || explicitSettings;

  const categoryRaw = typeof sp.category === 'string' ? sp.category : undefined;
  const requestCategory =
    categoryRaw === 'move_out' || tabParam === 'vacating'
      ? normalizeRequestCategoryId(categoryRaw ?? 'move_out')
      : categoryRaw
        ? normalizeRequestCategoryId(categoryRaw)
        : undefined;

  logger.info('post-login profile page routing', {
    customerId: session.customerId,
    email: session.email,
    section: sectionRaw,
    residentTab,
    tabParam,
    hasConfirmedBooking: ctx.hasConfirmedBooking,
    primaryBookingId: ctx.primaryBooking?.bookingId ?? null,
  });

  if (sectionRaw === 'identity') {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <PostLoginRouteObserver
          step="account_profile_identity"
          customerId={session.customerId}
          email={session.email}
        />
        <nav className="apg-account-nav mb-4 text-xs">
          <Link href="/account/profile">← Profile</Link>
        </nav>
        <DocumentsModule
          customerId={session.customerId}
          bookingCode={bookingCode}
          submitted={submitted}
        />
      </main>
    );
  }

  if (ctx.hasResidentPortalAccess && !explicitSettings) {
    // Legacy My Stay / profile-tab URLs → canonical routes.
    if (tabParam === 'home') redirect(residentStayHref('overview'));
    if (tabParam === 'wallet') redirect(residentStayHref('wallet'));
    if (tabParam === 'room' || tabParam === 'notifications') redirect(residentStayHref('overview'));
    if (tabParam === 'payments') {
      const paymentsSub = parseResidentPaymentsSub(subParam);
      if (paymentsSub === 'invoices') redirect(residentTabHref('invoices'));
      redirect(residentStayHref(parseResidentStaySub(subParam ?? 'payments')));
    }
    if (tabParam === 'profile' && sectionRaw === 'resident') {
      if (subParam === 'wallet') redirect(residentStayHref('wallet'));
      if (subParam === 'overview' || subParam === 'home') redirect(residentStayHref('overview'));
      redirect('/account/profile');
    }
    if (sectionRaw === 'resident' && !isAccountFeatureTab(residentTab, tabParam)) {
      redirect('/account/resident');
    }

    if (sectionRaw === 'resident' && isAccountFeatureTab(residentTab, tabParam)) {
      return (
        <main className="apg-resident-portal-main mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
          <PostLoginRouteObserver
            step="account_profile_resident_features"
            customerId={session.customerId}
            email={session.email}
            extra={{ residentTab }}
          />
          <ResidentPageHeader meta={residentTabMeta(residentTab)} />
          <ResidentSectionErrorBoundary
            page={`account_profile_resident_${residentTab}`}
            customerId={session.customerId}
            email={session.email}
            bookingId={ctx.primaryBooking?.bookingId ?? null}
            title="This section could not load"
          >
            <ResidentAreaSection
              preloaded={ctx}
              customerId={session.customerId}
              activeTab={residentTab}
              requestsQuery={{
                requestId: typeof sp.request === 'string' ? sp.request : undefined,
                make: sp.make === '1' || categoryRaw === 'move_out' || tabParam === 'vacating',
                category: requestCategory ?? undefined,
              }}
            />
          </ResidentSectionErrorBoundary>
        </main>
      );
    }

    return (
      <main className="apg-resident-portal-main mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <PostLoginRouteObserver
          step="account_profile_resident_account"
          customerId={session.customerId}
          email={session.email}
        />
        <header className="apg-resident-page-header mb-5 max-md:mb-6">
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <Link href="/account/bookings" className="text-apg-cyan hover:text-apg-orange">
              Bookings
            </Link>
            <span className="text-apg-muted" aria-hidden>
              /
            </span>
            <Link href="/account/resident" className="text-apg-cyan hover:text-apg-orange">
              My Stay
            </Link>
          </nav>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Profile</h1>
          <p className="mt-1 text-sm text-apg-silver">Your personal and account information.</p>
        </header>
        <nav
          className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-1"
          aria-label="Account features"
        >
          {(
            [
              ['requests', 'Requests'],
              ['invoices', 'Invoices'],
              ['referrals', 'Referrals'],
              ['concierge', 'Concierge'],
            ] as const
          ).map(([tab, label]) => (
            <Link
              key={tab}
              href={residentTabHref(tab)}
              className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium text-apg-silver transition hover:bg-white/5 hover:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>
        <ResidentSectionErrorBoundary
          page="account_profile_resident_profile"
          customerId={session.customerId}
          email={session.email}
          bookingId={ctx.primaryBooking?.bookingId ?? null}
          title="Profile could not load"
        >
          <Suspense fallback={<ResidentProfileTabSkeleton />}>
            <ResidentAccountProfileSection
              preloaded={ctx}
              customerId={session.customerId}
              editExpanded={editExpanded}
            />
          </Suspense>
        </ResidentSectionErrorBoundary>
      </main>
    );
  }

  const hubTab = parseLegacyHubTab(tabParam);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6">
      <PostLoginRouteObserver
        step="account_profile_settings"
        customerId={session.customerId}
        email={session.email}
      />
      <nav className="apg-account-nav mb-4 text-xs">
        <Link href="/account/bookings">My bookings</Link>
        <span className="mx-1">/</span>
        <span aria-current="page">Edit profile</span>
      </nav>

      {ctx.hasConfirmedBooking ? (
        <p className="mb-6 rounded-xl border border-apg-orange/30 bg-apg-orange/10 px-4 py-3 text-sm text-apg-silver">
          <Link href={residentStayHref('overview')} className="font-semibold text-apg-orange hover:underline">
            ← Back to My Stay
          </Link>
        </p>
      ) : null}

      {!ctx.hasConfirmedBooking ? (
        <div className="mb-8">
          <ResidentSectionErrorBoundary
            page="account_profile_status_tracker"
            customerId={session.customerId}
            email={session.email}
            title="Application progress could not load"
          >
            <ApplicationStatusTracker
              profileComplete={ctx.profileComplete}
              kycStatus={ctx.customer.kycStatus}
              hasConfirmedBooking={ctx.hasConfirmedBooking}
              depositPaid={ctx.depositOutstandingPaise === 0 && ctx.depositPaidPaise > 0}
              isResident={ctx.isActiveStay}
            />
          </ResidentSectionErrorBoundary>
        </div>
      ) : null}

      <SimpleAccountHub
        fullName={ctx.customer.fullName}
        email={ctx.customer.email}
        phoneLocal={indianLocalFromE164(ctx.customer.phone) ?? ''}
        phoneDisplay={formatIndianPhoneDisplay(session.phone)}
        bookingStatus={
          ctx.hasConfirmedBooking || ctx.isActiveStay ? 'Active' : ('Not booked yet' as const)
        }
        profileComplete={ctx.profileComplete}
        isActiveStay={ctx.isActiveStay}
        initialTab={hubTab}
        next={next}
        invoices={ctx.invoices}
        customerPhone={ctx.customer.phone}
        primaryBooking={ctx.primaryBooking}
        financialSummary={ctx.financialSummary}
        depositStatusLabel={ctx.depositStatusLabel}
        rentPaymentHistory={ctx.rentPaymentHistory}
      />
    </main>
  );
}
