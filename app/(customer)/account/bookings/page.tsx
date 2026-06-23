import Link from 'next/link';
import { customerHasConfirmedBooking, listBookingsForCustomer } from '@/src/db/queries/customer';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { formatIndianPhoneDisplay } from '@/src/lib/phone';
import { LogoutButton } from '@/src/components/auth/LogoutButton';
import {
  ApplicationBookingsList,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/account/resident/ApplicationBookingsPanel';
import { ACCOUNT_LINK_ON_DARK } from '@/src/components/customer/accountStyles';
import { residentTabHref } from '@/src/lib/accountNavigation';

export const dynamic = 'force-dynamic';

export default async function AccountBookingsPage() {
  const session = await requireCustomerSession('/account/bookings');
  const bookings = await listBookingsForCustomer(session.customerId);
  const rows = bookings.ok ? bookings.data : [];
  const confirmed = await customerHasConfirmedBooking(session.customerId);
  const hasConfirmedBooking = confirmed.ok && confirmed.data;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6">
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

      {bookings.ok === false ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          Couldn&apos;t reach the database.
        </p>
      ) : (
        <ApplicationBookingsList rows={rows} showResidentHome={hasConfirmedBooking} />
      )}

      <p className="text-sm text-apg-silver">
        {hasConfirmedBooking ? (
          <>
            Monthly stay?{' '}
            <Link href={residentTabHref('home')} className={ACCOUNT_LINK_ON_DARK}>
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
