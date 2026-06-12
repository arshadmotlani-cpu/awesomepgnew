import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getBookingByCode, getPaymentForCustomer } from '@/src/db/queries/customer';
import {
  requireCustomerOwnsBookingCode,
  requireCustomerSession,
} from '@/src/lib/auth/guards';
import { canCheckIn, getCustomerById } from '@/src/services/profile';
import { PaymentSuccessPoller } from '@/src/components/customer/PaymentSuccessPoller';
import { paiseToInr } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

export default async function PaymentSuccessPage(
  props: PageProps<'/booking/[bookingCode]/payment-success'>,
) {
  const { bookingCode } = await props.params;
  const sp = await props.searchParams;
  const paymentId = typeof sp.payment === 'string' ? sp.payment : undefined;

  const session = await requireCustomerSession(`/booking/${bookingCode}/payment-success`);
  try {
    await requireCustomerOwnsBookingCode(session, bookingCode);
  } catch {
    notFound();
  }

  const result = await getBookingByCode(bookingCode);
  if (!result.ok) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Couldn&apos;t load booking</h1>
        <p className="mt-3 text-sm text-rose-700">{result.error}</p>
      </main>
    );
  }
  if (!result.data) notFound();

  const booking = result.data;

  if (booking.status === 'pending_payment') {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        <PaymentSuccessPoller bookingCode={bookingCode} />
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Payment Received
          </h1>
          <p className="mt-3 text-sm text-zinc-700">
            We&apos;re confirming your payment for{' '}
            <span className="font-mono font-medium">{booking.bookingCode}</span>. This usually
            takes a few seconds.
          </p>
        </div>
      </main>
    );
  }

  if (booking.status !== 'confirmed') {
    redirect(`/booking/${bookingCode}`);
  }

  const customer = await getCustomerById(session.customerId);
  const checkInAllowed = customer ? canCheckIn(customer) : false;
  const kycHref = `/account/profile?section=identity&booking=${encodeURIComponent(bookingCode)}`;

  const payment =
    paymentId != null
      ? await getPaymentForCustomer(paymentId, session.customerId)
      : { ok: false as const, error: 'skip' };

  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 12l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Payment Received
            </h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-zinc-700">
          Your booking has been confirmed successfully.
        </p>
        <p className="mt-2 font-mono text-sm font-medium text-zinc-900">{booking.bookingCode}</p>
        <p className="mt-1 text-sm text-zinc-600">{booking.pg.name}</p>
        {payment.ok ? (
          <p className="mt-3 text-sm text-zinc-600">
            Amount paid: {paiseToInr(payment.data.amountPaise)}
            {' · '}
            <Link
              href={`/account/payments/${payment.data.id}/receipt`}
              className="font-medium text-indigo-600 hover:underline"
            >
              View receipt
            </Link>
          </p>
        ) : null}
      </div>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Next step</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Complete identity verification before check-in.
        </p>
        {checkInAllowed ? (
          <Link
            href={`/booking/${bookingCode}`}
            className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            View booking confirmation
          </Link>
        ) : (
          <Link
            href={kycHref}
            className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            Continue to Identity Verification
          </Link>
        )}
        <Link
          href={`/booking/${bookingCode}`}
          className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          View booking details
        </Link>
      </section>
    </main>
  );
}
