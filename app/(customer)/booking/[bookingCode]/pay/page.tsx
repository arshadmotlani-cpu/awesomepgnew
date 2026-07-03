import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { uploadPaymentScreenshotAction } from '@/app/(admin)/admin/pgs/payment-actions';
import { BookingCheckoutExperience } from '@/src/components/customer/checkout/BookingCheckoutExperience';
import { BookingFunnelShell } from '@/src/components/customer/checkout/BookingFunnelShell';
import { BookingInlineAuth } from '@/src/components/customer/checkout/BookingInlineAuth';
import { getBookingByCode } from '@/src/db/queries/customer';
import {
  requireCustomerOwnsBookingCode,
  requireCustomerSession,
} from '@/src/lib/auth/guards';
import { diffDays, parseDate } from '@/src/lib/dates';
import { persistedBookingToSummaryData } from '@/src/lib/booking/bookingDraft';
import { stayTypeFromPricingMode } from '@/src/lib/stayType';
import { resolveBookingCheckoutQr } from '@/src/lib/payments/checkoutQr';
import { paiseToInr as formatPaise } from '@/src/lib/format';
import { PS4_ADDON_LABEL, PS4_PLANS } from '@/src/lib/playstation/plans';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';
import {
  ensureDefaultPaymentCategoriesForPg,
  getElectricityDailyCategory,
  getRentDepositBookingCategory,
} from '@/src/services/pgPaymentDefaults';
import { getPendingMembershipForBooking } from '@/src/services/playstationMembership';
import { getPendingBookingPaymentRecord } from '@/src/services/qrPayments';
import { getActiveRejectionForEntity } from '@/src/services/paymentProofRejectionService';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { resolveBookingDepositCreditAppliedPaise } from '@/src/lib/billing/bookingCheckoutTotals';

export const dynamic = 'force-dynamic';

function checkInFromStayRange(stayRange: string): string | null {
  const match = stayRange.match(/^\["(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

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
      <main className="apg-aurora mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-bold text-white">Couldn&apos;t load booking</h1>
        <p className="mt-3 text-sm text-rose-300">{result.error}</p>
      </main>
    );
  }
  if (!result.data) {
    notFound();
  }

  const booking = result.data;
  const isReserveBooking = booking.durationMode === 'reserve';
  const customer = await getCustomerById(session.customerId);
  const profileComplete = customer ? isProfileComplete(customer) : false;

  if (booking.status !== 'pending_payment' && booking.status !== 'pending_approval') {
    if (booking.status === 'confirmed') {
      redirect(`/booking/${booking.bookingCode}/payment-success`);
    }
    redirect(`/booking/${booking.bookingCode}`);
  }

  await ensureDefaultPaymentCategoriesForPg(booking.pg.id);
  const rentCategory = await getRentDepositBookingCategory(booking.pg.id);
  const elecCategory = await getElectricityDailyCategory(booking.pg.id);
  const pendingPs4 = isReserveBooking ? null : await getPendingMembershipForBooking(booking.id);
  const pendingPayment = await getPendingBookingPaymentRecord(booking.id, session.customerId);
  const bookingRejection = pendingPayment
    ? await getActiveRejectionForEntity('pg_payment_record', pendingPayment.id)
    : null;
  const hasSubmittedProof = Boolean(pendingPayment?.paymentScreenshotUrl);
  const ps4Paise = pendingPs4?.amountPaise ?? 0;
  const snapshot = booking.pricingSnapshot as PricingSnapshot | null;
  const depositCreditAppliedPaise = resolveBookingDepositCreditAppliedPaise(snapshot?.depositCredit);
  const additionalDepositDuePaise =
    snapshot?.depositCredit?.adminTransferred === true
      ? (snapshot.depositCredit.additionalDuePaise ??
        Math.max(0, booking.depositPaise - depositCreditAppliedPaise))
      : booking.depositPaise;
  const priorOutstandingItems = snapshot?.priorOutstanding?.items ?? [];
  const rentLineItems = snapshot?.rentLineItems ?? [];
  const checkoutTotalPaise = booking.totalPaise + ps4Paise;
  const totalLabel = formatPaise(checkoutTotalPaise);
  const { qrImageUrl, upiId } = resolveBookingCheckoutQr({
    durationMode: booking.durationMode,
    hasPs4Addon: ps4Paise > 0,
    rentCategory,
    electricityCategory: elecCategory,
  });
  const ps4PlanLabel = pendingPs4 ? PS4_PLANS[pendingPs4.plan].label : null;

  const primaryReservation = booking.reservations[0];
  const roomNumber = primaryReservation?.roomNumber ?? null;
  const bedCode = primaryReservation?.bedCode ?? null;
  const checkInDate = primaryReservation
    ? checkInFromStayRange(primaryReservation.stayRange)
    : null;
  const stayNights =
    checkInDate && booking.expectedCheckoutDate
      ? diffDays(parseDate(checkInDate), parseDate(booking.expectedCheckoutDate))
      : null;

  const bedsLabel = booking.reservations
    .map((r) => `${r.bedCode} (Room ${r.roomNumber})`)
    .join(', ');

  const summary = persistedBookingToSummaryData({
    pgSlug: booking.pg.slug,
    pgName: booking.pg.name,
    roomNumber,
    bedCode,
    stayType: stayTypeFromPricingMode(booking.durationMode),
    checkIn: checkInDate,
    checkOut: booking.expectedCheckoutDate,
    stayNights,
    subtotalPaise: booking.subtotalPaise,
    depositPaise: booking.depositPaise,
    discountPaise: booking.discountPaise,
    totalDuePaise: checkoutTotalPaise,
  });

  return (
    <div className="apg-aurora apg-grid-overlay min-h-full">
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-5 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/booking/${bookingCode}`}
            className="text-sm font-medium text-apg-silver transition hover:text-apg-orange"
          >
            ← Back to booking
          </Link>
          <span className="rounded-full bg-apg-orange/15 px-3 py-1 text-xs font-semibold text-apg-orange ring-1 ring-apg-orange/30">
            Payment pending
          </span>
        </div>

        <div className="mt-6">
          <BookingFunnelShell activeStep="payment" initialSummary={summary}>
            {!profileComplete ? (
              <div className="mb-5">
                <BookingInlineAuth />
              </div>
            ) : (
            <BookingCheckoutExperience
              bookingCode={booking.bookingCode}
              pgName={booking.pg.name}
              roomNumber={roomNumber ?? undefined}
              bedCode={bedCode ?? undefined}
              bedsLabel={bedsLabel}
              isReserveBooking={isReserveBooking}
              durationMode={booking.durationMode}
              expectedCheckoutDate={booking.expectedCheckoutDate}
              checkInDate={checkInDate}
              stayNights={stayNights}
              reserveStart={booking.reserveStart}
              reserveCheckIn={booking.reserveCheckIn ?? booking.expectedCheckoutDate}
              subtotalPaise={booking.subtotalPaise}
              depositPaise={booking.depositPaise}
              depositCreditAppliedPaise={depositCreditAppliedPaise}
              additionalDepositDuePaise={additionalDepositDuePaise}
              priorOutstandingItems={priorOutstandingItems}
              rentLineItems={rentLineItems}
              discountPaise={booking.discountPaise}
              totalPaise={checkoutTotalPaise}
              totalLabel={totalLabel}
              qrImageUrl={qrImageUrl}
              upiId={upiId}
              uploadScreenshot={uploadPaymentScreenshotAction}
              membershipId={pendingPs4?.id}
              membershipAmountPaise={ps4Paise > 0 ? ps4Paise : undefined}
              membershipLabel={ps4PlanLabel}
              existingProofRecordId={hasSubmittedProof ? pendingPayment?.id : undefined}
              rejectionReason={bookingRejection?.reasonLabel ?? null}
              rejectionMessage={bookingRejection?.residentMessage ?? null}
              compactLayout
            />
            )}
          </BookingFunnelShell>
        </div>
      </main>
    </div>
  );
}
