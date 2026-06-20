import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getBookingByCode } from '@/src/db/queries/customer';
import {
  requireCustomerOwnsBookingCode,
  requireCustomerSession,
} from '@/src/lib/auth/guards';
import { STAY_CHECK_IN_TIME } from '@/src/lib/residents/stayBillingRules';
import { PaymentSuccessPoller } from '@/src/components/customer/PaymentSuccessPoller';

export const dynamic = 'force-dynamic';

function checkInFromStayRange(stayRange: string): string | null {
  const match = stayRange.match(/^\["(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export default async function PaymentSuccessPage(
  props: PageProps<'/booking/[bookingCode]/payment-success'>,
) {
  const { bookingCode } = await props.params;

  const session = await requireCustomerSession(`/booking/${bookingCode}/payment-success`);
  try {
    await requireCustomerOwnsBookingCode(session, bookingCode);
  } catch {
    notFound();
  }

  const result = await getBookingByCode(bookingCode);
  if (!result.ok || !result.data) notFound();

  const booking = result.data;

  if (booking.status === 'pending_payment') {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        <PaymentSuccessPoller bookingCode={bookingCode} />
        <div className="rounded-2xl border border-white/10 apg-glass-light p-8 text-center">
          <p className="text-lg font-bold text-white">Checking your payment…</p>
          <p className="mt-2 text-sm text-apg-silver">Just a moment.</p>
        </div>
      </main>
    );
  }

  if (booking.status !== 'confirmed') {
    redirect(`/booking/${bookingCode}`);
  }

  const bed = booking.reservations[0];
  const checkInDate = bed ? checkInFromStayRange(bed.stayRange) : null;

  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:px-6 text-center">
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-8">
        <p className="text-4xl" aria-hidden>
          🎉
        </p>
        <h1 className="mt-4 text-2xl font-bold text-white">Your bed is booked</h1>
        {bed ? (
          <dl className="mt-6 space-y-2 text-left text-sm">
            <div className="flex justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <dt className="text-apg-silver">Room</dt>
              <dd className="font-semibold text-white">{bed.roomNumber}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <dt className="text-apg-silver">Bed</dt>
              <dd className="font-semibold text-white">{bed.bedCode}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <dt className="text-apg-silver">Check-in</dt>
              <dd className="font-semibold text-white">
                {checkInDate ? `${checkInDate} · ${STAY_CHECK_IN_TIME}` : STAY_CHECK_IN_TIME}
              </dd>
            </div>
          </dl>
        ) : null}
        <p className="mt-5 text-sm text-apg-silver">{booking.pg.name}</p>
      </div>

      <Link
        href={`/booking/${bookingCode}`}
        className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-white/15 text-base font-bold text-white hover:border-apg-orange/40"
      >
        View booking
      </Link>
      <Link
        href="/account/profile?tab=stay"
        className="mt-3 inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-apg-orange text-base font-bold text-white"
      >
        Go to my stay
      </Link>
    </main>
  );
}
