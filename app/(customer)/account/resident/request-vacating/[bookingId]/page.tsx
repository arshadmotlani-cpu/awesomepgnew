import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { VacatingRequestForm } from '@/src/components/customer/VacatingRequestForm';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/accountStyles';
import { ACCOUNT_RESIDENT_HREF } from '@/src/lib/accountNavigation';
import { requireCustomerOwnsBooking, requireCustomerSession } from '@/src/lib/auth/guards';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export const dynamic = 'force-dynamic';

type RouteParams = { bookingId: string };

export default async function RequestVacatingPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { bookingId } = await params;
  const session = await requireCustomerSession(`/account/resident/request-vacating/${bookingId}`);
  await requireCustomerOwnsBooking(session, bookingId);

  const [row] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      durationMode: bookings.durationMode,
      status: bookings.status,
      pricingSnapshot: bookings.pricingSnapshot,
      customerFullName: customers.fullName,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) notFound();

  const isMonthlyResidency =
    row.durationMode === 'monthly' || row.durationMode === 'open_ended';
  if (row.status !== 'confirmed' || !isMonthlyResidency) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-10 sm:px-6">
        <header>
          <Link href={ACCOUNT_RESIDENT_HREF} className={ACCOUNT_BACK_LINK}>
            ← Back to resident area
          </Link>
          <h1 className={`mt-2 ${ACCOUNT_PAGE_TITLE}`}>Request vacate</h1>
        </header>
        <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          Move-out requests apply to ongoing monthly stays. Open your booking page for short-stay
          details or contact your PG manager.
        </p>
        <Link
          href={`/booking/${row.bookingCode}`}
          className="inline-flex text-sm font-semibold text-indigo-600 hover:text-indigo-500"
        >
          View booking →
        </Link>
      </div>
    );
  }

  const snapshot = row.pricingSnapshot as PricingSnapshot | null;
  const monthlyRentPaise =
    snapshot?.perBed.reduce((acc, bed) => acc + (bed.monthlyRatePaise ?? 0), 0) ?? 0;
  const depositSummary = await getDepositSummaryForBooking(bookingId);
  const depositHeldPaise = depositSummary?.refundableBalancePaise ?? 0;

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-10 sm:px-6">
      <header>
        <Link href={ACCOUNT_RESIDENT_HREF} className={ACCOUNT_BACK_LINK}>
          ← Back to resident area
        </Link>
        <h1 className={`mt-2 ${ACCOUNT_PAGE_TITLE}`}>Request vacate</h1>
        <p className={ACCOUNT_PAGE_SUBTITLE}>
          Booking <span className="font-mono text-white">{row.bookingCode}</span> ·{' '}
          {row.customerFullName}
        </p>
      </header>

      <VacatingRequestForm
        bookingId={bookingId}
        depositHeldPaise={depositHeldPaise}
        monthlyRentPaise={monthlyRentPaise}
      />
    </div>
  );
}
