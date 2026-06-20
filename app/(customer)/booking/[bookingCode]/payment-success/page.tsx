import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getBookingByCode } from '@/src/db/queries/customer';
import {
  requireCustomerOwnsBookingCode,
  requireCustomerSession,
} from '@/src/lib/auth/guards';
import { PaymentSuccessPoller } from '@/src/components/customer/PaymentSuccessPoller';

export const dynamic = 'force-dynamic';

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

  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:px-6 text-center">
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-8">
        <p className="text-4xl" aria-hidden>
          🎉
        </p>
        <h1 className="mt-4 text-2xl font-bold text-white">Your room is booked!</h1>
        <p className="mt-3 text-base text-emerald-100">We are waiting for your arrival.</p>
        <p className="mt-4 text-sm text-apg-silver">{booking.pg.name}</p>
      </div>

      <Link
        href="/account/profile"
        className="mt-8 inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-apg-orange text-base font-bold text-white"
      >
        Go to My Account
      </Link>
    </main>
  );
}
