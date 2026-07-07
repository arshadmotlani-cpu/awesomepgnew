import Link from 'next/link';
import { listBookingsForCustomer } from '@/src/db/queries/customer';
import { customerHasResidentPortalAccess } from '@/src/lib/residents/residentPortalAccess';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { formatIndianPhoneDisplay } from '@/src/lib/phone';
import { LogoutButton } from '@/src/components/auth/LogoutButton';
import {
  ApplicationBookingsList,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/account/resident/ApplicationBookingsPanel';
import { ApplicationStatusTracker } from '@/src/components/customer/account/ApplicationStatusTracker';
import { ResidentSectionErrorBoundary } from '@/src/components/customer/account/resident/ResidentSectionErrorBoundary';
import { PostLoginRouteObserver } from '@/src/components/customer/account/PostLoginRouteObserver';
import { ResidentAccountIncompletePanel } from '@/src/components/customer/account/ResidentAccountIncompletePanel';
import { ACCOUNT_LINK_ON_DARK } from '@/src/components/customer/accountStyles';
import { legacyResidentTabHref, residentTabHref } from '@/src/lib/accountNavigation';
import { loadResidentAccountContextSafe } from '@/src/services/residentAccountContextSafe';
import { logger } from '@/src/lib/logger';

export const dynamic = 'force-dynamic';

export default async function AccountBookingsPage() {
  const session = await requireCustomerSession('/account/bookings');

  logger.info('post-login bookings page session ok', {
    customerId: session.customerId,
    email: session.email,
    sessionId: session.sessionId,
  });

  const [bookings, contextLoad] = await Promise.all([
    listBookingsForCustomer(session.customerId),
    loadResidentAccountContextSafe(session.customerId, session.email),
  ]);

  const rows = bookings.ok ? bookings.data : [];
  const hasResidentPortalAccess = await customerHasResidentPortalAccess(session.customerId);
  const ctx = contextLoad.ok ? contextLoad.ctx : null;

  logger.info('post-login bookings page data loaded', {
    customerId: session.customerId,
    email: session.email,
    bookingCount: rows.length,
    contextOk: contextLoad.ok,
    contextReason: contextLoad.ok ? null : contextLoad.reason,
    hasResidentPortalAccess,
    bookingCodes: rows.map((row) => row.bookingCode),
    bookingStatuses: rows.map((row) => row.status),
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <PostLoginRouteObserver
        step="account_bookings_render"
        customerId={session.customerId}
        email={session.email}
        extra={{ bookingCount: rows.length, contextOk: contextLoad.ok }}
      />

      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className={ACCOUNT_PAGE_TITLE}>My bookings</h1>
          <p className={ACCOUNT_PAGE_SUBTITLE}>
            Track short stays and monthly bookings — pay, verify identity, and check in.
          </p>
          <p className="mt-1 text-xs text-apg-silver">
            Signed in as {session.fullName} · {formatIndianPhoneDisplay(session.phone)}
          </p>
        </div>
        <LogoutButton scope="customer" tone="dark" />
      </header>

      {!contextLoad.ok && contextLoad.reason === 'load_failed' ? (
        <ResidentAccountIncompletePanel
          title="We could not load your stay summary"
          message="Your sign-in worked, but part of your resident profile did not load. You can still open bookings below, or try again in a moment."
        />
      ) : null}

      {ctx ? (
        <ResidentSectionErrorBoundary
          page="account_bookings_status_tracker"
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
      ) : null}

      {bookings.ok === false ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          Couldn&apos;t reach the database.
        </p>
      ) : (
        <ResidentSectionErrorBoundary
          page="account_bookings_list"
          customerId={session.customerId}
          email={session.email}
          title="Your bookings could not load"
        >
          <ApplicationBookingsList
            rows={rows}
            showResidentHome={hasResidentPortalAccess}
            customerId={session.customerId}
            email={session.email}
          />
        </ResidentSectionErrorBoundary>
      )}

      <p className="text-sm text-apg-silver">
        {hasResidentPortalAccess ? (
          <>
            Monthly stay?{' '}
            <Link href={legacyResidentTabHref('home')} className={ACCOUNT_LINK_ON_DARK}>
              Open resident home →
            </Link>
          </>
        ) : (
          <>Resident billing unlocks after the office approves your booking.</>
        )}
      </p>
    </div>
  );
}
