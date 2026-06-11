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
import {
  DEFAULT_ELECTRICITY_DAILY_QR_PATH,
  DEFAULT_ELECTRICITY_DAILY_UPI_ID,
  DEFAULT_RENT_DEPOSIT_QR_PATH,
  DEFAULT_RENT_DEPOSIT_UPI_ID,
} from '@/src/lib/payments/defaultQr';
import { paiseToInr as formatPaise } from '@/src/lib/format';
import { PS4_ADDON_LABEL, PS4_PLANS } from '@/src/lib/playstation/plans';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';
import {
  ensureDefaultPaymentCategoriesForPg,
  getElectricityDailyCategory,
  getRentDepositBookingCategory,
} from '@/src/services/pgPaymentDefaults';
import { getPendingMembershipForBooking } from '@/src/services/playstationMembership';

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
  const rentCategory = await getRentDepositBookingCategory(booking.pg.id);
  const elecCategory = await getElectricityDailyCategory(booking.pg.id);
  const pendingPs4 = await getPendingMembershipForBooking(booking.id);
  const ps4Paise = pendingPs4?.amountPaise ?? 0;
  const checkoutTotalPaise = booking.totalPaise + ps4Paise;
  const totalLabel = formatPaise(checkoutTotalPaise);
  const usePs4Qr = ps4Paise > 0;
  const qrImageUrl = usePs4Qr
    ? (elecCategory?.qrCodeImageUrl ?? DEFAULT_ELECTRICITY_DAILY_QR_PATH)
    : (rentCategory?.qrCodeImageUrl ?? DEFAULT_RENT_DEPOSIT_QR_PATH);
  const upiId = usePs4Qr
    ? (elecCategory?.upiId ?? DEFAULT_ELECTRICITY_DAILY_UPI_ID)
    : (rentCategory?.upiId ?? DEFAULT_RENT_DEPOSIT_UPI_ID);
  const ps4PlanLabel = pendingPs4 ? PS4_PLANS[pendingPs4.plan].label : null;

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
            {pendingPs4 ? (
              <div className="flex justify-between">
                <span className="text-zinc-500">
                  {ps4PlanLabel} · {PS4_ADDON_LABEL}
                </span>
                <span className="text-zinc-900">{formatPaise(ps4Paise)}</span>
              </div>
            ) : null}
            <div className="mt-2 flex justify-between border-t border-zinc-100 pt-2 text-base font-semibold">
              <span className="text-zinc-900">Total due now</span>
              <span className="text-zinc-900">{totalLabel}</span>
            </div>
            {ps4Paise > 0 ? (
              <p className="text-[11px] text-zinc-500">
                Bed/deposit {formatPaise(booking.totalPaise)} + PS4 add-on{' '}
                {formatPaise(ps4Paise)} — separate records, one UPI payment.
              </p>
            ) : null}
          </div>

          <div className="mt-5">
            <DepositRefundNotice variant="compact" />
            <div className="mt-4">
              <BookingQrCheckout
                bookingCode={booking.bookingCode}
                pgName={booking.pg.name}
                totalPaise={checkoutTotalPaise}
                totalLabel={totalLabel}
                bookingAmountPaise={booking.totalPaise}
                qrImageUrl={qrImageUrl}
                upiId={upiId}
                uploadScreenshot={uploadPaymentScreenshotAction}
                membershipId={pendingPs4?.id}
                membershipAmountPaise={ps4Paise > 0 ? ps4Paise : undefined}
                membershipLabel={ps4PlanLabel ?? undefined}
              />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
