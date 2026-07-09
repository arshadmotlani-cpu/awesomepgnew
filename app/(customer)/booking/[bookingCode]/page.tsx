import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getBookingByCode, listExtensionsForBooking } from '@/src/db/queries/customer';
import {
  requireCustomerOwnsBookingCode,
  requireCustomerSession,
} from '@/src/lib/auth/guards';
import { parseDaterange } from '@/src/services/availability';
import { formatDate as formatDateUtc, parseDate } from '@/src/lib/dates';
import { adminStayTypeLabel, stayTypeFromPricingMode, stayTypeLabel } from '@/src/lib/stayType';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import { BookingRequestVacateSection } from '@/src/components/customer/BookingRequestVacateSection';
import { getVacatingForBooking } from '@/src/db/queries/customer';
import { KycCheckInBanner } from '@/src/components/customer/KycCheckInBanner';
import { canCheckIn, getCustomerById } from '@/src/services/profile';
import { getLatestKycSubmission } from '@/src/services/kyc';
import { RoachieResidentBriefing } from '@/src/components/cockroach/RoachieResidentBriefing';
import { buildBriefingInputForBooking } from '@/src/lib/cockroach/briefingFromBooking';
import { ApplicationBookingPrimaryActions } from '@/src/components/customer/account/resident/ApplicationBookingPrimaryActions';
import { AwaitingBookingApprovalPanel } from '@/src/components/customer/account/resident/AwaitingBookingApprovalPanel';
import { accountProfileHref, legacyResidentTabHref, residentTabHref } from '@/src/lib/accountNavigation';
import { deriveBookingApprovalPhase } from '@/src/lib/bookingApproval';
import {
  customerBookingBannerCopy,
  customerBookingStatusTone,
  isBookingStatus,
  isTerminalBookingLifecycleStatus,
} from '@/src/lib/booking/bookingStatus';
import { getPendingBookingPaymentRecord } from '@/src/services/qrPayments';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { completeReserveBookingAction } from './actions';

export const dynamic = 'force-dynamic';

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
  const reserveTerminated =
    b.durationMode === 'reserve' &&
    (b.reserveStatus === 'cancelled' || b.reserveStatus === 'expired');
  if (isTerminalBookingLifecycleStatus(b.status) || reserveTerminated) {
    redirect('/account/bookings');
  }

  const customer = await getCustomerById(session.customerId);
  const latestKyc = customer
    ? await getLatestKycSubmission(session.customerId)
    : null;
  const documentsSubmitted =
    customer?.kycStatus === 'pending' &&
    latestKyc != null &&
    latestKyc.status === 'pending';
  const checkInAllowed = customer ? canCheckIn(customer) : false;
  const bookingStatus = isBookingStatus(b.status) ? b.status : 'draft';
  const tone = customerBookingStatusTone(bookingStatus);
  const banner = customerBookingBannerCopy(bookingStatus);

  const paymentStatusLabel = banner.paymentStatusLabel;

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

  const pendingPayment = await getPendingBookingPaymentRecord(b.id, session.customerId);
  const reserveConfirmed = b.durationMode === 'reserve' && b.reserveStatus === 'active';
  const reserveUnderReview =
    b.durationMode === 'reserve' &&
    !reserveConfirmed &&
    (b.reserveStatus === 'under_review' || bookingStatus === 'pending_approval');
  const approvalPhase = deriveBookingApprovalPhase({
    status: b.status,
    hasPendingPaymentProof: Boolean(pendingPayment),
    hasActiveReserve: reserveConfirmed,
  });
  const isAwaitingApproval = approvalPhase === 'awaiting_admin_approval';
  const isPendingPayment = approvalPhase === 'awaiting_payment';
  const isPending = isPendingPayment || isAwaitingApproval;
  const isSuperseded = bookingStatus === 'superseded';
  const isTerminalBanner =
    banner.variant === 'cancelled' || banner.variant === 'superseded' || banner.variant === 'neutral';
  const isConfirmed = bookingStatus === 'confirmed' && !reserveConfirmed;
  const reserveDeadline = b.reserveCheckIn ?? b.expectedCheckoutDate;
  const reserveDaysRemaining = reserveDeadline
    ? Math.max(0, Math.ceil((parseDate(reserveDeadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;
  const bannerHeadline = reserveConfirmed
    ? 'Reservation confirmed'
    : reserveUnderReview
      ? 'Reservation under review'
      : banner.headline;
  const bannerCopy =
    reserveConfirmed
      ? `Your bed is reserved until ${reserveDeadline ? formatDate(reserveDeadline) : 'your booking deadline'}. Complete booking before expiry to start your stay.`
      : reserveUnderReview
        ? 'Your reservation payment proof is with the office. We will confirm your bed hold once review is complete.'
      : bookingStatus === 'confirmed'
      ? `Your stay at ${b.pg.name} is locked in. The operator will reach out with check-in instructions.`
      : banner.copy;
  const bannerClasses =
    reserveConfirmed || reserveUnderReview
      ? 'border-violet-200 from-violet-50 to-white'
      : banner.variant === 'pending'
      ? 'border-amber-200 from-amber-50 to-white'
      : banner.variant === 'confirmed'
        ? 'border-emerald-200 from-emerald-50 to-white'
        : banner.variant === 'superseded'
          ? 'border-violet-200 from-violet-50 to-white'
          : banner.variant === 'cancelled'
            ? 'border-rose-200 from-rose-50 to-white'
            : 'border-zinc-200 from-zinc-50 to-white';
  const iconBgClass =
    reserveConfirmed || reserveUnderReview
      ? 'bg-violet-600'
      : banner.variant === 'pending'
      ? 'bg-amber-600'
      : banner.variant === 'confirmed'
        ? 'bg-emerald-600'
        : banner.variant === 'superseded'
          ? 'bg-violet-600'
          : banner.variant === 'cancelled'
            ? 'bg-rose-600'
            : 'bg-zinc-600';
  const headlineClass =
    reserveConfirmed || reserveUnderReview
      ? 'text-violet-800'
      : banner.variant === 'pending'
      ? 'text-amber-700'
      : banner.variant === 'confirmed'
        ? 'text-emerald-700'
        : banner.variant === 'superseded'
          ? 'text-violet-800'
          : banner.variant === 'cancelled'
            ? 'text-rose-700'
            : 'text-zinc-700';

  // Extend stay retired — to continue living, cancel vacating notice instead.
  const canExtend = false;

  // Hotel-style cancellation removed — ongoing residents use Request Vacate.
  const extsResult = await listExtensionsForBooking(b.id);
  const extensions = extsResult.ok ? extsResult.data : [];

  const vacatingRes = await getVacatingForBooking(b.id);
  const vacating = vacatingRes.ok ? vacatingRes.data : null;

  const briefing = isConfirmed
    ? await buildBriefingInputForBooking({
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
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      {briefing ? (
        <RoachieResidentBriefing
          sessionKey={`booking-${b.bookingCode}-briefing-v1`}
          {...briefing}
        />
      ) : null}
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
                d={
                  isTerminalBanner
                    ? 'M6 6l12 12M18 6L6 18'
                    : 'M5 12l4 4L19 7'
                }
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
        </div>
      </div>

      <div className="mt-6">
        {isSuperseded ? null : isAwaitingApproval ? (
          <AwaitingBookingApprovalPanel
            bookingCode={b.bookingCode}
            paymentProofRecordId={pendingPayment?.id}
            kycStatusLabel={kycStatusLabel}
            documentsSubmitted={documentsSubmitted}
          />
        ) : (
          <ApplicationBookingPrimaryActions
            bookingCode={b.bookingCode}
            status={bookingStatus}
            payHref={isPendingPayment ? `/booking/${b.bookingCode}/pay` : null}
            identityHref={accountProfileHref('identity', { booking: b.bookingCode })}
            showIdentity={Boolean(customer && !checkInAllowed && isConfirmed)}
            residentHomeHref={legacyResidentTabHref('home')}
            isReserveConfirmed={reserveConfirmed}
          />
        )}
      </div>

      {reserveConfirmed ? (
        <section className="mt-6 rounded-xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-violet-900">Reservation confirmed</h2>
          <p className="mt-1 text-sm text-violet-800">
            This is a reservation hold only. Deposit, move-in, and resident billing start after you complete booking.
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <SummaryRow term="Reservation code" value={b.reserveCode ?? '—'} mono />
            <SummaryRow term="Reserved room" value={roomSummary || '—'} />
            <SummaryRow term="Reserved bed" value={bedSummary || '—'} />
            <SummaryRow term="Reservation amount paid" value={paiseToInr(b.totalPaise)} />
            <SummaryRow term="Reservation status" value="Reserved" />
            <SummaryRow term="Booking deadline" value={reserveDeadline ? formatDate(reserveDeadline) : '—'} />
            <SummaryRow term="Days remaining" value={reserveDaysRemaining != null ? String(reserveDaysRemaining) : '—'} />
            <SummaryRow term="Remaining balance" value={paiseToInr(0)} />
          </dl>
          <form
            action={async () => {
              'use server';
              await completeReserveBookingAction(b.bookingCode);
            }}
            className="mt-4"
          >
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
            >
              Complete booking before expiry
            </button>
          </form>
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">
          {reserveConfirmed ? 'Reservation summary' : 'Booking summary'}
        </h2>
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
        <Tile
          term="Stay type"
          value={stayTypeLabel(stayTypeFromPricingMode(b.durationMode))}
        />
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

      {/* Charges — quote only; hidden while admin review is in progress */}
      {!isAwaitingApproval ? (
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">
          {isConfirmed ? 'Charges' : 'Quoted charges (not billed yet)'}
        </h2>
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
          <span className="text-sm font-medium">{isConfirmed ? 'Total paid' : 'Total due at checkout'}</span>
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
      ) : null}

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

      <BookingRequestVacateSection
        bookingId={b.id}
        bookingCode={b.bookingCode}
        durationMode={b.durationMode}
        status={b.status}
        vacating={vacating}
      />

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
