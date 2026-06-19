import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listPaymentsForBooking } from '@/src/db/queries/customer';
import { requireCustomerOwnsBooking, requireCustomerSession } from '@/src/lib/auth/guards';
import { buildWalletLedger } from '@/src/lib/residents/walletLedger';
import { ConsoleLedger } from '@/src/components/customer/design-system';
import { ApgCard } from '@/src/components/customer/design-system';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/accountStyles';
import { residentTabHref } from '@/src/lib/accountNavigation';

export const dynamic = 'force-dynamic';

type RouteParams = { bookingId: string };

export default async function PaymentHistoryPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { bookingId } = await params;
  const session = await requireCustomerSession(`/account/resident/history/${bookingId}`);

  let booking: { bookingCode: string };
  try {
    booking = await requireCustomerOwnsBooking(session, bookingId);
  } catch {
    notFound();
  }

  const list = await listPaymentsForBooking(bookingId);
  const rows = list.ok ? list.data : [];

  const ledgerEntries = buildWalletLedger({
    depositEntries: [],
    payments: rows,
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-10 sm:px-6">
      <header>
        <Link href={residentTabHref('wallet')} className={ACCOUNT_BACK_LINK}>
          ← Back to wallet
        </Link>
        <h1 className={`mt-2 ${ACCOUNT_PAGE_TITLE}`}>Payment history</h1>
        <p className={ACCOUNT_PAGE_SUBTITLE}>
          {session.fullName} · Booking{' '}
          <span className="font-mono">{booking.bookingCode}</span>
        </p>
      </header>

      <ApgCard tier="account" className="p-5">
        <ConsoleLedger
          entries={ledgerEntries}
          showRunningBalance={false}
          emptyMessage="No payments yet for this booking."
        />
      </ApgCard>

      {!list.ok ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          Couldn&apos;t reach the database.
        </p>
      ) : null}
    </div>
  );
}
