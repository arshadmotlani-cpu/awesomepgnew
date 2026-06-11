import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { uploadPaymentScreenshotAction } from '@/app/(admin)/admin/pgs/payment-actions';
import { BookingQrCheckout } from '@/src/components/customer/BookingQrCheckout';
import { DepositRefundNotice } from '@/src/components/customer/DepositRefundNotice';
import { getBookingByCode } from '@/src/db/queries/customer';
import {
  requireCustomerOwnsBookingCode,
  requireCustomerSession,
} from '@/src/lib/auth/guards';
import { isCloudinaryConfigured } from '@/src/lib/images/cloudinary';
import {
  DEFAULT_RENT_DEPOSIT_QR_PATH,
  DEFAULT_RENT_DEPOSIT_UPI_ID,
} from '@/src/lib/payments/defaultQr';
import { paiseToInr as formatPaise } from '@/src/lib/format';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';
import {
  ensureDefaultPaymentCategoriesForPg,
  getRentDepositBookingCategory,
} from '@/src/services/pgPaymentDefaults';

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
        <h1 className="text-2xl font-semibold text-zinc-900">Couldn&apos;t load booking</h1>
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

  if (booking.status !== 'pending_payment') {
    if (booking.status === 'confirmed') {
      redirect(`/booking/${booking.bookingCode}/payment-success`);
    }
    redirect(`/booking/${booking.bookingCode}`);
  }

  await ensureDefaultPaymentCategoriesForPg(booking.pg.id);
  const category = await getRentDepositBookingCategory(booking.pg.id);
  const totalLabel = formatPaise(booking.totalPaise);
  const canUpload = isCloudinaryConfigured();

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
        Booking <span className="font-mono text-zinc-900">{booking.bookingCode}</span> is held
        until we approve your UPI payment. Upload a screenshot after paying the exact amount below.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <section className="md:col-span-2 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Reservation
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-zinc-500">PG</dt>
            <dd className="text-right text-zinc-900">{booking.pg.name}</dd>
            <dt className="text-zinc-500">Stay type</dt>
            <dd className="text-right capitalize text-zinc-900">
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
            <DepositRefundNotice variant="compact" />
            <div className="mt-4">
            {canUpload ? (
              <BookingQrCheckout
                bookingCode={booking.bookingCode}
                pgName={booking.pg.name}
                totalPaise={booking.totalPaise}
                totalLabel={totalLabel}
                qrImageUrl={category?.qrCodeImageUrl ?? DEFAULT_RENT_DEPOSIT_QR_PATH}
                upiId={category?.upiId ?? DEFAULT_RENT_DEPOSIT_UPI_ID}
                uploadScreenshot={uploadPaymentScreenshotAction}
              />
            ) : (
              <p className="text-sm text-amber-800">
                Screenshot upload is not configured. Pay via UPI{' '}
                <strong>{category?.upiId ?? DEFAULT_RENT_DEPOSIT_UPI_ID}</strong> and contact
                support on WhatsApp with booking code {booking.bookingCode}.
              </p>
            )}
          </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
