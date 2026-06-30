import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SimpleAccountHub } from '@/src/components/customer/simple/SimpleAccountHub';
import { ApplicationStatusTracker } from '@/src/components/customer/account/ApplicationStatusTracker';
import { DocumentsModule } from '@/src/components/customer/account/v2/DocumentsModule';
import { ResidentAreaSection } from '@/src/components/customer/account/ResidentAreaSection';
import { ResidentPageHeader } from '@/src/components/customer/account/resident/ResidentPageHeader';
import { ResidentSectionErrorBoundary } from '@/src/components/customer/account/resident/ResidentSectionErrorBoundary';
import { PostLoginRouteObserver } from '@/src/components/customer/account/PostLoginRouteObserver';
import { ResidentAccountIncompletePanel } from '@/src/components/customer/account/ResidentAccountIncompletePanel';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  parseAccountSection,
  parseResidentTab,
  type ResidentTab,
  residentTabHref,
} from '@/src/lib/accountNavigation';
import { residentTabMeta } from '@/src/lib/residentNavigation';
import { formatIndianPhoneDisplay, indianLocalFromE164 } from '@/src/lib/phone';
import { loadResidentAccountContextSafe } from '@/src/services/residentAccountContextSafe';
import { logger } from '@/src/lib/logger';

function parseLegacyHubTab(
  value: string | undefined,
): 'profile' | 'stay' | 'payments' | 'invoices' {
  if (value === 'stay' || value === 'payments' || value === 'invoices') return value;
  return 'profile';
}

function residentTabFromLegacy(tab: string | undefined): ResidentTab {
  if (tab === 'payments' || tab === 'invoices') return 'payments';
  if (tab === 'stay') return 'home';
  return parseResidentTab(tab);
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
        ) : (
          <ResidentAccountIncompletePanel />
        )}
      </main>
    );
  }

  const ctx = contextLoad.ctx;
  const sp = await props.searchParams;
  const next = typeof sp.next === 'string' ? sp.next : undefined;
  const bookingCode = typeof sp.booking === 'string' ? sp.booking : undefined;
  const submitted = sp.submitted === '1';
  const section = parseAccountSection(typeof sp.section === 'string' ? sp.section : undefined);
  const tabParam = typeof sp.tab === 'string' ? sp.tab : undefined;
  const residentTab = residentTabFromLegacy(tabParam);
  const explicitSettings = sp.settings === '1';

  logger.info('post-login profile page routing', {
    customerId: session.customerId,
    email: session.email,
    section,
    residentTab,
    hasConfirmedBooking: ctx.hasConfirmedBooking,
    primaryBookingId: ctx.primaryBooking?.bookingId ?? null,
  });

  if (section === 'identity') {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <PostLoginRouteObserver
          step="account_profile_identity"
          customerId={session.customerId}
          email={session.email}
        />
        <nav className="apg-account-nav mb-4 text-xs">
          <Link href={ctx.hasConfirmedBooking ? residentTabHref('home') : '/account/profile'}>
            ← {ctx.hasConfirmedBooking ? 'Your stay' : 'My account'}
          </Link>
        </nav>
        <DocumentsModule
          customerId={session.customerId}
          bookingCode={bookingCode}
          submitted={submitted}
        />
      </main>
    );
  }

  if (ctx.hasConfirmedBooking && section === 'profile' && !explicitSettings) {
    redirect(residentTabHref(residentTab));
  }

  if (ctx.hasConfirmedBooking && section === 'resident') {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <PostLoginRouteObserver
          step="account_profile_resident_dashboard"
          customerId={session.customerId}
          email={session.email}
          extra={{ residentTab }}
        />
        <div className="hidden md:block">
          <ResidentPageHeader meta={residentTabMeta(residentTab)} />
        </div>
        <ResidentSectionErrorBoundary
          page={`account_profile_resident_${residentTab}`}
          customerId={session.customerId}
          email={session.email}
          bookingId={ctx.primaryBooking?.bookingId ?? null}
          title="Your resident dashboard could not load"
        >
          <ResidentAreaSection
            customerId={session.customerId}
            activeTab={residentTab}
            requestsQuery={{
              requestId: typeof sp.request === 'string' ? sp.request : undefined,
              make: sp.make === '1',
              category:
                typeof sp.category === 'string'
                  ? (sp.category as import('@/src/lib/residents/requestCenter').RequestCategoryId)
                  : undefined,
            }}
          />
        </ResidentSectionErrorBoundary>
      </main>
    );
  }

  const bookingStatus =
    ctx.hasConfirmedBooking || ctx.isActiveStay ? 'Active' : ('Not booked yet' as const);

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
        <span aria-current="page">Account settings</span>
      </nav>

      {ctx.hasConfirmedBooking ? (
        <p className="mb-6 rounded-xl border border-apg-orange/30 bg-apg-orange/10 px-4 py-3 text-sm text-apg-silver">
          <Link href={residentTabHref('home')} className="font-semibold text-apg-orange hover:underline">
            ← Back to your stay
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
        bookingStatus={bookingStatus}
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
