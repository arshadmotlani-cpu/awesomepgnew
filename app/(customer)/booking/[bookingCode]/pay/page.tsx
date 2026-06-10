import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getBookingByCode } from '@/src/db/queries/customer';
import {
  requireCustomerOwnsBookingCode,
  requireCustomerSession,
} from '@/src/lib/auth/guards';
import { paiseToInr as formatPaise } from '@/src/lib/format';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';
import { RazorpayCheckoutButton } from '@/src/components/customer/PayButtons';
import { isRazorpayConfigured } from '@/src/lib/payments/config';
import { PaymentUnavailable } from '@/src/components/customer/PaymentUnavailable';

export const dynamic = 'force-dynamic';

export default async function PayPage(props: PageProps<'/booking/[bookingCode]/pay'>) {
  const { bookingCode } = await props.params;
  const session = await requireCustomerSession(`/booking/${bookingCode}/pay`);
  try {
    await requireCustomerOwnsBookingCode(session, bookingCode);
  } catch {
    notFound();
  }

  const result = await getBookingByCode(bookingCode);
  if (!result.ok) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-zinc-900">Couldn't load booking</h1>
        <p className="mt-3 text-sm text-rose-700">{result.error}</p>
      </main>
    );
  }
  if (!result.data) {
    notFound();
  }

  const booking = result.data;
  const customer = await getCustomerById(session.customerId);
  if (!customer || !isProfileComplete(customer)) {
    redirect(`/account/profile?next=${encodeURIComponent(`/booking/${bookingCode}/pay`)}`);
  }

  // If the booking is already confirmed / cancelled, the pay page makes no
  // sense — bounce to the confirmation/status page.
  if (booking.status !== 'pending_payment') {
    if (booking.status === 'confirmed') {
      redirect(`/booking/${booking.bookingCode}/payment-success`);
    }
    redirect(`/booking/${booking.bookingCode}`);
  }

  const razorpayReady = isRazorpayConfigured();
  const totalLabel = formatPaise(booking.totalPaise);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="text-xs text-zinc-500">
        <Link className="hover:text-zinc-900" href="/pgs">
          PGs
        </Link>
        <span className="mx-1">/</span>
        <Link className="hover:text-zinc-900" href={`/pgs/${booking.pg.slug}`}>
          {booking.pg.name}
        </Link>
        <span className="mx-1">/</span>
        <span className="text-zinc-900">Pay for {booking.bookingCode}</span>
      </nav>

      <div className="mt-4 flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Complete your payment
        </h1>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
          Awaiting payment
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-600">
        Booking{' '}
        <span className="font-mono text-zinc-900">{booking.bookingCode}</span> is
        held for you until payment is received. If you don't pay before the
        hold expires, the beds are released back to availability.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <section className="md:col-span-2 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Reservation
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-zinc-500">PG</dt>
            <dd className="text-right text-zinc-900">{booking.pg.name}</dd>
            <dt className="text-zinc-500">Address</dt>
            <dd className="text-right text-zinc-900">
              {booking.pg.addressLine1}, {booking.pg.city}, {booking.pg.state}{' '}
              {booking.pg.pincode}
            </dd>
            <dt className="text-zinc-500">Stay type</dt>
            <dd className="text-right text-zinc-900 capitalize">
              {booking.durationMode.replace('_', '-')}
            </dd>
            <dt className="text-zinc-500">Check-out</dt>
            <dd className="text-right text-zinc-900">
              {booking.expectedCheckoutDate ?? 'Open-ended'}
            </dd>
            <dt className="text-zinc-500">Bed{booking.reservations.length === 1 ? '' : 's'}</dt>
            <dd className="text-right text-zinc-900">
              {booking.reservations
                .map((r) => `${r.bedCode} (Room ${r.roomNumber})`)
                .join(', ')}
            </dd>
          </dl>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Customer
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-zinc-500">Name</dt>
            <dd className="text-right text-zinc-900">{booking.customer.fullName}</dd>
            <dt className="text-zinc-500">Email</dt>
            <dd className="text-right text-zinc-900">{booking.customer.email}</dd>
            <dt className="text-zinc-500">Phone</dt>
            <dd className="text-right text-zinc-900">{booking.customer.phone}</dd>
          </dl>
        </section>

        <aside className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Amount due
          </h2>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Subtotal (rent)</span>
              <span className="text-zinc-900">{formatPaise(booking.subtotalPaise)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Refundable deposit</span>
              <span className="text-zinc-900">{formatPaise(booking.depositPaise)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-zinc-100 pt-2 text-base font-semibold">
              <span className="text-zinc-900">Total</span>
              <span className="text-zinc-900">{totalLabel}</span>
            </div>
          </div>

          <div className="mt-5">
            {razorpayReady ? (
              <RazorpayCheckoutButton
                bookingCode={booking.bookingCode}
                totalLabel={totalLabel}
              />
            ) : (
              <PaymentUnavailable />
            )}
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
            The refundable deposit is held against damages and returned when you check out.
          </p>
        </aside>
      </div>
    </main>
  );
}
