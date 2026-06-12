import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers } from '@/src/db/schema';
import { VacatingRequestForm } from '@/src/components/customer/VacatingRequestForm';
import { vacatingPenalty } from '@/src/services/billing';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { paiseToInr } from '@/src/lib/format';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/accountStyles';
import { ACCOUNT_RESIDENT_HREF } from '@/src/lib/accountNavigation';
import { requireCustomerOwnsBooking, requireCustomerSession } from '@/src/lib/auth/guards';

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
      pricingSnapshot: bookings.pricingSnapshot,
      durationMode: bookings.durationMode,
      status: bookings.status,
      customerFullName: customers.fullName,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) notFound();

  const snapshot = row.pricingSnapshot as PricingSnapshot | null;
  const monthlyRent =
    snapshot?.perBed.reduce((acc, b) => acc + (b.monthlyRatePaise ?? 0), 0) ?? 0;
  const penalty = vacatingPenalty(monthlyRent);

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-10 sm:px-6">
      <header>
        <Link href={ACCOUNT_RESIDENT_HREF} className={ACCOUNT_BACK_LINK}>
          ← Back to resident area
        </Link>
        <h1 className={`mt-2 ${ACCOUNT_PAGE_TITLE}`}>Submit vacating request</h1>
        <p className={ACCOUNT_PAGE_SUBTITLE}>
          Booking <span className="font-mono text-white">{row.bookingCode}</span> ·{' '}
          {row.customerFullName}
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
        <p className="font-medium">Notice policy</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
          <li>
            <strong>≥ 14 days notice:</strong> no deposit deduction.
          </li>
          <li>
            <strong>&lt; 14 days notice:</strong> fixed 5-day rent deduction —{' '}
            {paiseToInr(penalty)} (5 × monthly rent / 30). No additional
            shortfall recovery.
          </li>
        </ul>
      </section>

      <VacatingRequestForm bookingId={bookingId} monthlyRentPaise={monthlyRent} />
    </div>
  );
}
