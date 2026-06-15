import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBookingByCode, listExtensionsForBooking } from '@/src/db/queries/customer';
import {
  requireCustomerOwnsBookingCode,
  requireCustomerSession,
} from '@/src/lib/auth/guards';
import { parseDaterange } from '@/src/services/availability';
import { formatDate as formatDateUtc } from '@/src/lib/dates';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import { CancelBookingForm } from '@/src/components/customer/CancelBookingForm';
import { KycCheckInBanner } from '@/src/components/customer/KycCheckInBanner';
import { canCheckIn, getCustomerById } from '@/src/services/profile';
import { getLatestKycSubmission } from '@/src/services/kyc';
import { RoachieResidentBriefing } from '@/src/components/cockroach/RoachieResidentBriefing';
import { buildBriefingInputForBooking } from '@/src/lib/cockroach/briefingFromBooking';
import type { PricingSnapshot } from '@/src/db/schema/bookings';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, { bg: string; text: string; ring: string; label: string }> = {
  confirmed: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    ring: 'ring-emerald-200',
    label: 'Confirmed',
  },
  pending_payment: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    ring: 'ring-amber-200',
    label: 'Pending payment',
  },
  draft: {
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    ring: 'ring-zinc-200',
    label: 'Draft',
  },
  cancelled: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    ring: 'ring-rose-200',
    label: 'Cancelled',
  },
  completed: {
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    ring: 'ring-zinc-200',
    label: 'Completed',
  },
  refunded: {
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    ring: 'ring-zinc-200',
    label: 'Refunded',
  },
};

export async function generateMetadata(
  props: PageProps<'/booking/[bookingCode]'>,
) {
  const { bookingCode } = await props.params;
  return { title: `Booking ${bookingCode}` };
}

export default async function BookingConfirmationPage(
  props: PageProps<'/booking/[bookingCode]'>,
) {
  const { bookingCode } = await props.params;
  const session = await requireCustomerSession(`/booking/${bookingCode}`);
  try {
    await requireCustomerOwnsBookingCode(session, bookingCode);
  } catch {
    notFound();
  }

  const result = await getBookingByCode(bookingCode);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <p className="font-semibold">Couldn&apos;t load this booking.</p>
          <p className="mt-1">{result.error}</p>
        </div>
      </div>
    );
  }
  if (!result.data) notFound();

  const b = result.data;
  const customer = await getCustomerById(session.customerId);
  const latestKyc = customer
    ? await getLatestKycSubmission(session.customerId)
    : null;
  const documentsSubmitted =
    customer?.kycStatus === 'pending' &&
    latestKyc != null &&
    latestKyc.status === 'pending';
  const checkInAllowed = customer ? canCheckIn(customer) : false;
  const tone = STATUS_TONE[b.status] ?? STATUS_TONE.confirmed;

  const paymentStatusLabel =
    b.status === 'confirmed'
      ? 'Paid'
      : b.status === 'pending_payment'
        ? 'Awaiting payment'
        : titleCase(b.status);

  const kycStatusLabel = !customer
    ? '—'
    : customer.kycStatus === 'approved'
      ? 'Verified'
      : customer.kycStatus === 'rejected'
        ? 'Action required'
        : documentsSubmitted
          ? 'Under review'
          : 'Not submitted';

  const roomSummary = [
    ...new Set(b.reservations.map((r) => `Room ${r.roomNumber}`)),
  ].join(', ');
  const bedSummary = b.reservations.map((r) => r.bedCode).join(', ');

  const stayRange = b.reservations[0]
    ? parseDaterange(b.reservations[0].stayRange)
    : null;
  const checkIn = stayRange?.lower ? formatDateUtc(stayRange.lower) : '—';
  const checkOut = stayRange?.upper ? formatDateUtc(stayRange.upper) : '—';

  // Banner copy + colour adapt to the booking status. Phase 4 introduces
  // pending_payment / cancelled / refunded as fully reachable user-facing
  // states; the confirmation page needs to render them all.
  const isPending = b.status === 'pending_payment';
  const isCancelled = b.status === 'cancelled' || b.status === 'refunded';
  const bannerHeadline = isPending
    ? 'Booking awaiting payment'
    : isCancelled
      ? `Booking ${b.status === 'refunded' ? 'refunded' : 'cancelled'}`
      : 'Booking confirmed';
  const bannerCopy = isPending
    ? 'Your beds are held for you. Complete payment to confirm the stay — if the hold lapses, the beds are released.'
    : isCancelled
      ? 'This booking is no longer active. Any applicable refund has been queued per the cancellation policy.'
      : `Your stay at ${b.pg.name} is locked in. The operator will reach out with check-in instructions.`;
  const bannerClasses = isPending
    ? 'border-amber-200 from-amber-50 to-white'
    : isCancelled
      ? 'border-rose-200 from-rose-50 to-white'
      : 'border-emerald-200 from-emerald-50 to-white';
  const iconBgClass = isPending
    ? 'bg-amber-600'
    : isCancelled
      ? 'bg-rose-600'
      : 'bg-emerald-600';
  const headlineClass = isPending
    ? 'text-amber-700'
    : isCancelled
      ? 'text-rose-700'
      : 'text-emerald-700';

  // Customers may cancel any booking that is still pending or confirmed.
  // Once cancelled / refunded / completed, the action button disappears.
  const canCancel = b.status === 'pending_payment' || b.status === 'confirmed';

  // Extend stay retired — to continue living, cancel vacating notice instead.
  const canExtend = false;

  // Load extensions for the booking — we render them as a "stay history"
  // strip even when there are zero (the section just gets hidden).
  const extsResult = await listExtensionsForBooking(b.id);
  const extensions = extsResult.ok ? extsResult.data : [];

  const briefing = await buildBriefingInputForBooking({
    customerId: session.customerId,
    residentName: session.fullName || b.customer.fullName,
    kycLabel: kycStatusLabel,
    booking: {
      bookingId: b.id,
      bookingCode: b.bookingCode,
      pgName: b.pg.name,
      durationMode: b.durationMode,
      status: b.status,
      expectedCheckoutDate: b.expectedCheckoutDate,
      pricingSnapshot: b.pricingSnapshot as PricingSnapshot | null,
      reservations: b.reservations.map((r) => ({
        roomNumber: r.roomNumber,
        bedCode: r.bedCode,
        stayRange: r.stayRange,
      })),
      customerFullName: b.customer.fullName,
    },
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <RoachieResidentBriefing
        sessionKey={`booking-${b.bookingCode}-briefing-v1`}
        {...briefing}
      />
      {b.status === 'confirmed' && customer && !checkInAllowed ? (
        <KycCheckInBanner
          kycStatus={customer.kycStatus}
          bookingCode={b.bookingCode}
          documentsSubmitted={documentsSubmitted}
        />
      ) : null}

      <div
        className={`overflow-hidden rounded-2xl border bg-gradient-to-br p-6 shadow-sm ${bannerClasses}`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full text-white ${iconBgClass}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d={isCancelled ? 'M6 6l12 12M18 6L6 18' : 'M5 12l4 4L19 7'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <p
              className={`text-xs font-semibold uppercase tracking-wider ${headlineClass}`}
            >
              {bannerHeadline}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              {b.bookingCode}
            </h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-zinc-700">{bannerCopy}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset ${tone.bg} ${tone.text} ${tone.ring}`}
          >
            {tone.label}
          </span>
          <span className="text-zinc-500">Booked {formatDateTime(b.createdAt)}</span>
          {isPending ? (
            <Link
              href={`/booking/${b.bookingCode}/pay`}
              className="ml-auto inline-flex items-center rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              Pay now →
            </Link>
          ) : null}
          {canExtend ? (
            <Link
              href={`/booking/${b.bookingCode}/extend`}
              className="ml-auto inline-flex items-center rounded-md border border-indigo-300 bg-white px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              Extend stay →
            </Link>
          ) : null}
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Booking at a glance</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <SummaryRow term="Booking code" value={b.bookingCode} mono />
          <SummaryRow term="PG name" value={b.pg.name} />
          <SummaryRow term="Room" value={roomSummary || '—'} />
          <SummaryRow term="Bed" value={bedSummary || '—'} />
          <SummaryRow term="Check-in date" value={formatDate(checkIn)} />
          <SummaryRow
            term="Check-out date"
            value={
              b.expectedCheckoutDate
                ? formatDate(b.expectedCheckoutDate)
                : 'Open-ended'
            }
          />
          <SummaryRow term="Payment status" value={paymentStatusLabel} />
          <SummaryRow term="KYC status" value={kycStatusLabel} />
        </dl>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Tile term="Stay type" value={titleCase(b.durationMode)} />
        <Tile term="Beds reserved" value={String(b.reservations.length)} />
      </section>

      {/* Beds */}
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Reserved beds</h2>
        <ul className="mt-3 divide-y divide-zinc-100">
          {b.reservations.map((r) => {
            const range = parseDaterange(r.stayRange);
            const from = range.lower ? formatDateUtc(range.lower) : '—';
            const until = range.upper ? formatDateUtc(range.upper) : '—';
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <span className="font-medium text-zinc-900">
                  Bed {r.bedCode}
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    Room {r.roomNumber} · {r.floorLabel}
                  </span>
                </span>
                <span className="text-xs text-zinc-500">
                  {formatDate(from)} → {formatDate(until)} ·{' '}
                  <span className="font-medium text-zinc-700">{titleCase(r.status)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Phase 5 — extensions */}
      {extensions.length > 0 ? (
        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-900">Stay extensions</h2>
            {canExtend ? (
              <Link
                href={`/booking/${b.bookingCode}/extend`}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
              >
                Extend again →
              </Link>
            ) : null}
          </div>
          <ul className="mt-3 divide-y divide-zinc-100 text-sm">
            {extensions.map((e) => {
              const statusTone =
                e.status === 'paid'
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : e.status === 'pending'
                    ? 'bg-amber-50 text-amber-800 ring-amber-200'
                    : 'bg-zinc-100 text-zinc-700 ring-zinc-200';
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="font-medium text-zinc-900">
                      Extension until {formatDate(e.requestedUntilDate)}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {titleCase(e.extensionDurationMode)} · {e.bedCount} bed
                      {e.bedCount === 1 ? '' : 's'} · requested by{' '}
                      {e.requestedBy}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-zinc-900">
                      {paiseToInr(e.quotedTotalPaise)}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusTone}`}
                    >
                      {titleCase(e.status)}
                    </span>
                    {e.status === 'pending' ? (
                      <Link
                        href={`/booking/${b.bookingCode}/extend/${e.id}/pay`}
                        className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-indigo-700"
                      >
                        Pay →
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Charges */}
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Charges</h2>
        {b.pricingSnapshot?.perBed?.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {b.pricingSnapshot.perBed.map((line, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="text-zinc-700">
                  {titleCase(line.durationMode)} ·{' '}
                  {line.units} unit{line.units === 1 ? '' : 's'}
                </span>
                <span className="font-semibold text-zinc-900">
                  {paiseToInr(line.lineTotalPaise)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No charge breakdown stored.</p>
        )}
        <hr className="my-4 border-zinc-200" />
        <dl className="space-y-1.5 text-sm">
          <Row term="Subtotal" value={paiseToInr(b.subtotalPaise)} />
          {b.discountPaise > 0 ? (
            <Row term="Promo discount" value={`−${paiseToInr(b.discountPaise)}`} />
          ) : null}
          <Row term="Refundable deposit" value={paiseToInr(b.depositPaise)} />
        </dl>
        <div className="mt-3 flex items-center justify-between rounded-md bg-zinc-900 px-3 py-2 text-white">
          <span className="text-sm font-medium">Total paid</span>
          <span className="text-base font-semibold">
            {paiseToInr(b.totalPaise)}
          </span>
        </div>
        {b.pricingSnapshot?.dateCoupon ? (
          <p className="mt-2 text-xs text-emerald-700">
            Promo discount applied — {paiseToInr(b.pricingSnapshot.dateCoupon.discountPaise)} saved
          </p>
        ) : null}
      </section>

      {/* Customer + PG */}
      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Your contact</h2>
          <p className="mt-2 text-sm text-zinc-900">{b.customer.fullName}</p>
          <p className="text-xs text-zinc-500">{b.customer.email}</p>
          <p className="text-xs text-zinc-500">{b.customer.phone}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Property</h2>
          <p className="mt-2 text-sm text-zinc-900">{b.pg.name}</p>
          <p className="text-xs text-zinc-500">{b.pg.addressLine1}</p>
          <p className="text-xs text-zinc-500">
            {b.pg.city}, {b.pg.state} {b.pg.pincode}
          </p>
        </div>
      </section>

      {b.notes ? (
        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Notes to the operator</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
            {b.notes}
          </p>
        </section>
      ) : null}

      {/* Cancellation surface — only when the booking can still be cancelled. */}
      {canCancel ? (
        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Cancel this booking</h2>
          {b.pricingSnapshot?.cancellationPolicy ? (
            <p className="mt-2 text-xs text-zinc-500">
              Policy in effect at booking time:
              {' '}full refund of rent if cancelled at least{' '}
              <strong>{b.pricingSnapshot.cancellationPolicy.fullRefundUntilHrsBefore}h</strong>{' '}
              before check-in;{' '}
              <strong>{b.pricingSnapshot.cancellationPolicy.partialRefundPct}%</strong>{' '}
              refund of rent if cancelled at least{' '}
              <strong>{b.pricingSnapshot.cancellationPolicy.partialRefundUntilHrsBefore}h</strong>{' '}
              before. Deposit is refunded{' '}
              <strong>{b.pricingSnapshot.cancellationPolicy.depositRefundPct}%</strong>{' '}
              in all cases.
            </p>
          ) : null}
          <div className="mt-3">
            <CancelBookingForm bookingCode={b.bookingCode} />
          </div>
        </section>
      ) : null}

      <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row">
        <Link
          href="/account/bookings"
          className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          All my bookings
        </Link>
        <Link
          href={`/pgs/${b.pg.slug}`}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          Back to {b.pg.name}
        </Link>
      </div>
    </div>
  );
}

function Tile({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {term}
      </p>
      <p className="mt-1 text-base font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-500">{term}</dt>
      <dd className="text-zinc-900">{value}</dd>
    </div>
  );
}

function SummaryRow({
  term,
  value,
  mono = false,
}: {
  term: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {term}
      </dt>
      <dd className={`font-medium text-zinc-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
