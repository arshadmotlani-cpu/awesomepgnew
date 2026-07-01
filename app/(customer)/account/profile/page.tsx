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
  parseResidentTab,
  parseResidentProfileSub,
  parseResidentPaymentsSub,
  legacySubFromTab,
  type ResidentTab,
  residentTabHref,
  residentProfileHref,
  residentPaymentsHref,
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

function resolveResidentRouting(tabParam: string | undefined): {
  tab: ResidentTab;
  profileSub: ReturnType<typeof parseResidentProfileSub>;
  paymentsSub: ReturnType<typeof parseResidentPaymentsSub>;
  requestsCategory?: string;
} {
  const legacy = legacySubFromTab(tabParam);
  const tab = parseResidentTab(tabParam);
  return {
    tab,
    profileSub: legacy.profileSub ?? 'overview',
    paymentsSub: legacy.paymentsSub ?? 'due',
    requestsCategory: legacy.requestsCategory,
  };
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
  const sectionRaw = typeof sp.section === 'string' ? sp.section : undefined;
  const explicitSettings = sp.settings === '1';

  const tabParam = typeof sp.tab === 'string' ? sp.tab : undefined;
  const subParam = typeof sp.sub === 'string' ? sp.sub : undefined;
  const routing = resolveResidentRouting(tabParam);
  const profileSub = parseResidentProfileSub(subParam ?? routing.profileSub);
  const paymentsSub = parseResidentPaymentsSub(subParam ?? routing.paymentsSub);
  const residentTab = routing.tab;
  const editExpanded = sp.edit === '1' || explicitSettings;

  const categoryRaw = typeof sp.category === 'string' ? sp.category : routing.requestsCategory;
  const requestCategory = categoryRaw ? normalizeRequestCategoryId(categoryRaw) : undefined;

  logger.info('post-login profile page routing', {
    customerId: session.customerId,
    email: session.email,
    section: sectionRaw,
    residentTab,
    profileSub,
    paymentsSub,
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
          <Link href={ctx.hasConfirmedBooking ? residentProfileHref('overview') : '/account/profile'}>
            ← {ctx.hasConfirmedBooking ? 'Profile' : 'My account'}
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

  if (ctx.hasConfirmedBooking && !explicitSettings) {
    if (sectionRaw === 'profile') {
      redirect(residentTabHref(residentTab, { sub: profileSub }));
    }

    // Legacy tab redirects
    if (tabParam === 'home') redirect(residentProfileHref('overview'));
    if (tabParam === 'wallet') redirect(residentProfileHref('wallet'));
    if (tabParam === 'room' || tabParam === 'notifications') redirect(residentProfileHref('overview'));
    if (tabParam === 'vacating') redirect(residentTabHref('requests', { category: 'move_out' }));

    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <PostLoginRouteObserver
          step="account_profile_resident_dashboard"
          customerId={session.customerId}
          email={session.email}
          extra={{ residentTab, profileSub, paymentsSub }}
        />
        <ResidentPageHeader meta={residentTabMeta(residentTab)} />
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
            profileSub={profileSub}
            paymentsSub={paymentsSub}
            editExpanded={editExpanded}
            requestsQuery={{
              requestId: typeof sp.request === 'string' ? sp.request : undefined,
              make: sp.make === '1' || categoryRaw === 'move_out',
              category: requestCategory ?? undefined,
            }}
          />
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
          <Link href={residentProfileHref('overview')} className="font-semibold text-apg-orange hover:underline">
            ← Back to Profile
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
