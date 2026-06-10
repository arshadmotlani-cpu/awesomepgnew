import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBookingByCode } from '@/src/db/queries/customer';
import {
  requireCustomerOwnsBookingCode,
  requireCustomerSession,
} from '@/src/lib/auth/guards';
import { defaultExtensionUntilDate } from '@/src/lib/dateDefaults';
import { formatDate, titleCase } from '@/src/lib/format';
import { ExtendBookingForm } from '@/src/components/customer/ExtendBookingForm';

export const dynamic = 'force-dynamic';

/**
 * Customer extension entry page.
 *
 * Only confirmed bookings with a finite `expected_checkout_date` can be
 * extended (open-ended stays auto-renew monthly — covered in a later
 * phase). Anything else renders an explanation + a back-link instead of
 * the form so the user can't get stuck on a dead-end URL.
 */
export default async function ExtendBookingPage(
  props: PageProps<'/booking/[bookingCode]/extend'>,
) {
  const { bookingCode } = await props.params;
  const session = await requireCustomerSession(`/booking/${bookingCode}/extend`);
  try {
    await requireCustomerOwnsBookingCode(session, bookingCode);
  } catch {
    notFound();
  }

  const result = await getBookingByCode(bookingCode);
  if (!result.ok) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Couldn&apos;t load booking
        </h1>
        <p className="mt-3 text-sm text-rose-700">{result.error}</p>
      </main>
    );
  }
  if (!result.data) notFound();

  const booking = result.data;

  // Gate: only confirmed + finite-checkout bookings can extend.
  if (booking.status !== 'confirmed' || !booking.expectedCheckoutDate) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Extension not available
        </h1>
        <p className="mt-3 text-sm text-zinc-600">
          {booking.status !== 'confirmed' ? (
            <>
              This booking is currently in status{' '}
              <span className="font-mono">{booking.status}</span>. Only
              confirmed bookings can be extended.
            </>
          ) : (
            <>
              This is an open-ended stay without a fixed checkout date to extend.
              Your booking renews monthly — contact the property if you need to
              change your stay.
            </>
          )}
        </p>
        <Link
          href={`/booking/${booking.bookingCode}`}
          className="mt-6 inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          ← Back to booking
        </Link>
      </main>
    );
  }

  const currentCheckout = booking.expectedCheckoutDate;
  const defaultUntil = defaultExtensionUntilDate(currentCheckout);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <nav className="text-xs text-zinc-500">
        <Link className="hover:text-zinc-900" href="/account/bookings">
          My bookings
        </Link>
        <span className="mx-1">/</span>
        <Link
          className="hover:text-zinc-900"
          href={`/booking/${booking.bookingCode}`}
        >
          {booking.bookingCode}
        </Link>
        <span className="mx-1">/</span>
        <span className="text-zinc-900">Extend</span>
      </nav>

      <header className="mt-3">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Extend your stay
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Pick a new check-out date and we&apos;ll quote the rent for{' '}
          {booking.reservations.length} bed
          {booking.reservations.length === 1 ? '' : 's'} at{' '}
          <span className="font-medium text-zinc-900">{booking.pg.name}</span>.
          The deposit you&apos;ve already paid stays untouched.
        </p>
      </header>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Current stay
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-zinc-500">Booking</dt>
          <dd className="text-right font-mono text-zinc-900">
            {booking.bookingCode}
          </dd>
          <dt className="text-zinc-500">Current checkout</dt>
          <dd className="text-right text-zinc-900">
            {formatDate(currentCheckout)}
          </dd>
          <dt className="text-zinc-500">Stay type</dt>
          <dd className="text-right text-zinc-900">
            {titleCase(booking.durationMode.replace('_', '-'))}
          </dd>
          <dt className="text-zinc-500">
            Bed{booking.reservations.length === 1 ? '' : 's'}
          </dt>
          <dd className="text-right text-zinc-900">
            {booking.reservations.map((r) => r.bedCode).join(', ')}
          </dd>
        </dl>
      </section>

      <section className="mt-6">
        <ExtendBookingForm
          bookingCode={booking.bookingCode}
          currentCheckout={currentCheckout}
          defaultUntilDate={defaultUntil}
        />
      </section>

      <p className="mt-6 text-[11px] leading-relaxed text-zinc-500">
        After you submit, we&apos;ll hold the beds for the extension dates
        and send you to the payment page. If you don&apos;t pay in time the
        hold is released automatically.
      </p>
    </main>
  );
}
