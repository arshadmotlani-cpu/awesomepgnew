import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { getVacatingForBooking } from '@/src/db/queries/customer';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { PS4_PLANS, type Ps4PlanId } from '@/src/lib/playstation/plans';
import { parseDaterange } from '@/src/services/availability';
import { formatDate as formatDateUtc } from '@/src/lib/dates';
import type { ResidentBriefingInput } from '@/src/lib/cockroach/residentBriefing';
import {
  getMembershipForDashboard,
  isActiveTenant,
} from '@/src/services/playstationMembership';

type BookingBriefingSource = {
  bookingId: string;
  bookingCode: string;
  pgName: string;
  durationMode: string;
  status: string;
  expectedCheckoutDate: string | null;
  pricingSnapshot: PricingSnapshot | null;
  reservations: Array<{ roomNumber: string; bedCode: string; stayRange: string }>;
  customerFullName: string;
};

export async function buildBriefingInputForBooking(args: {
  customerId: string;
  residentName: string;
  booking: BookingBriefingSource;
  kycLabel: string;
}): Promise<ResidentBriefingInput> {
  const { booking, customerId, residentName, kycLabel } = args;
  const roomNumbers = [...new Set(booking.reservations.map((r) => r.roomNumber))];
  const bedCodes = booking.reservations.map((r) => r.bedCode);

  const monthlyRentPaise =
    booking.pricingSnapshot?.perBed.reduce(
      (acc, bed) => acc + (bed.monthlyRatePaise ?? 0),
      0,
    ) ?? 0;

  const isMonthlyStay =
    booking.durationMode === 'monthly' || booking.durationMode === 'open_ended';
  const tenantActive = isMonthlyStay ? await isActiveTenant(customerId) : false;

  let ps4Active = false;
  let ps4PlanLabel: string | undefined;
  let vacatingDate: string | undefined;
  let vacatingStatus: string | undefined;

  if (tenantActive) {
    const [membership, vacating] = await Promise.all([
      getMembershipForDashboard(customerId),
      getVacatingForBooking(booking.bookingId),
    ]);
    const now = new Date();
    if (
      membership &&
      membership.status === 'active' &&
      membership.expiresAt &&
      membership.expiresAt > now
    ) {
      ps4Active = true;
      ps4PlanLabel = PS4_PLANS[membership.plan as Ps4PlanId].label;
    }
    if (vacating.ok && vacating.data) {
      vacatingDate = formatDate(vacating.data.vacatingDate);
      vacatingStatus = titleCase(vacating.data.status);
    }
  }

  const stayRange = booking.reservations[0]
    ? parseDaterange(booking.reservations[0].stayRange)
    : null;
  const checkIn = stayRange?.lower ? formatDateUtc(stayRange.lower) : '—';

  return {
    residentName,
    pgName: booking.pgName,
    bookingCode: booking.bookingCode,
    bookingId: booking.bookingId,
    roomLabel: roomNumbers.length ? `Room ${roomNumbers.join(', ')}` : 'Room —',
    bedLabel: bedCodes.length ? `Bed ${bedCodes.join(', ')}` : 'Bed —',
    checkInDate: checkIn,
    checkoutLabel: booking.expectedCheckoutDate
      ? formatDate(booking.expectedCheckoutDate)
      : booking.durationMode === 'open_ended'
        ? 'Open-ended (living here)'
        : '—',
    statusLabel: titleCase(booking.status),
    paymentLabel:
      booking.status === 'confirmed'
        ? 'Paid'
        : booking.status === 'pending_payment'
          ? 'Awaiting payment'
          : titleCase(booking.status),
    monthlyRentLabel: monthlyRentPaise > 0 ? paiseToInr(monthlyRentPaise) : undefined,
    kycLabel,
    isActiveResident: tenantActive,
    ps4Active,
    ps4PlanLabel,
    vacatingDate,
    vacatingStatus,
  };
}
