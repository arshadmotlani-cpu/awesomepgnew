/**
 * Occupancy eligibility — a bed may only show / hold a resident when all gates pass.
 *
 * SSOT for blocking occupancy remains bed_reservations; these rules govern when
 * an active reservation is considered valid operational occupancy.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  bookings,
  customers,
  depositLedger,
  payments,
} from '@/src/db/schema';
import { formatDate } from '@/src/lib/dates';
import {
  OCCUPANCY_PLACEHOLDER_EMAIL,
  OCCUPANCY_PLACEHOLDER_PHONE,
} from '@/src/lib/occupancySqlFilters';
import { getCustomerVerificationStatus } from '@/src/services/residentAdmin';

export type OccupancyEligibilityResult =
  | { ok: true }
  | { ok: false; reason: string; code: OccupancyEligibilityCode };

export type OccupancyEligibilityCode =
  | 'booking_not_confirmed'
  | 'reservation_not_active'
  | 'stay_not_covering_today'
  | 'payment_not_confirmed'
  | 'kyc_not_satisfied';

/** Booking must be confirmed (not pending_payment / completed / cancelled). */
export function isBookingStatusEligibleForOccupancy(
  status: string,
): boolean {
  return status === 'confirmed';
}

/** Reservation must be hold or active to block inventory. */
export function isReservationStatusEligibleForOccupancy(
  status: string,
): boolean {
  return status === 'active' || status === 'hold';
}

/**
 * Whether vacating approval should shorten the stay range to open the bed for
 * pre-booking. Same-day checkout must not shorten before completion — half-open
 * range `[start, today)` excludes today and breaks checkout.
 */
export function shouldShortenStayOnVacatingApproval(
  vacatingDate: string,
  today?: string,
): boolean {
  const t = today ?? formatDate(new Date());
  return vacatingDate > t;
}

/**
 * Whether checkout can proceed when the stay no longer covers today because
 * vacating was already approved (stay shortened to vacating date).
 */
export function canCompleteCheckoutWithoutActiveStayToday(input: {
  vacatingDate: string;
  vacatingStatus: 'pending' | 'approved';
  today?: string;
}): boolean {
  const today = input.today ?? formatDate(new Date());
  return (
    input.vacatingDate <= today &&
    (input.vacatingStatus === 'approved' || input.vacatingStatus === 'pending')
  );
}

async function hasConfirmedPayment(bookingId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, bookingId),
        eq(payments.status, 'succeeded'),
        sql`${payments.amountPaise} > 0`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function hasDepositLedgerCollection(bookingId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: depositLedger.id })
    .from(depositLedger)
    .where(
      and(
        eq(depositLedger.bookingId, bookingId),
        eq(depositLedger.entryKind, 'collected'),
      ),
    )
    .limit(1);
  return Boolean(row);
}

function isOccupancyPlaceholderBooking(input: {
  notes: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
}): boolean {
  const notes = input.notes?.toLowerCase() ?? '';
  return (
    input.customerPhone === OCCUPANCY_PLACEHOLDER_PHONE ||
    input.customerEmail === OCCUPANCY_PLACEHOLDER_EMAIL ||
    notes.includes('occupancy placeholder') ||
    notes.includes('full occupancy marker')
  );
}

type BookingGateRow = {
  id: string;
  status: string;
  customerId: string;
  createdVia: string | null;
  notes: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
};

async function loadBookingGateRow(bookingId: string): Promise<BookingGateRow | null> {
  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      customerId: bookings.customerId,
      createdVia: bookings.createdVia,
      notes: bookings.notes,
      customerPhone: customers.phone,
      customerEmail: customers.email,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return booking ?? null;
}

/**
 * Gates 1, 2, and 5 — confirmed booking, verified payment path, KYC policy.
 * Does not require the reservation to cover today (used before stay extension).
 */
export async function assertBookingOperationalGates(
  bookingId: string,
  opts?: { skipKyc?: boolean },
): Promise<OccupancyEligibilityResult> {
  const booking = await loadBookingGateRow(bookingId);
  if (!booking) {
    return { ok: false, code: 'booking_not_confirmed', reason: 'Booking not found.' };
  }

  if (!isBookingStatusEligibleForOccupancy(booking.status)) {
    return {
      ok: false,
      code: 'booking_not_confirmed',
      reason: `Booking status is ${booking.status}; must be confirmed for occupancy.`,
    };
  }

  if (isOccupancyPlaceholderBooking(booking)) {
    return { ok: true };
  }

  const paid = await hasConfirmedPayment(bookingId);
  const depositCollected = await hasDepositLedgerCollection(bookingId);
  const adminAssigned = booking.createdVia === 'admin';

  if (!paid && !depositCollected && !adminAssigned) {
    return {
      ok: false,
      code: 'payment_not_confirmed',
      reason: 'No confirmed payment or deposit collection on this booking.',
    };
  }

  if (!opts?.skipKyc) {
    const verification = await getCustomerVerificationStatus(booking.customerId);
    if (!verification?.isVerified) {
      const [customer] = await db
        .select({ kycStatus: customers.kycStatus })
        .from(customers)
        .where(eq(customers.id, booking.customerId))
        .limit(1);
      if (customer?.kycStatus !== 'approved') {
        return {
          ok: false,
          code: 'kyc_not_satisfied',
          reason: 'Resident KYC / verification not satisfied.',
        };
      }
    }
  }

  return { ok: true };
}

/**
 * Gates 1–3 and 5 for restoring a stay (reservation may not cover today yet).
 */
export async function assertMayRestoreOccupancy(
  bookingId: string,
  opts?: { includeCompletedReservations?: boolean; skipKyc?: boolean },
): Promise<OccupancyEligibilityResult> {
  const gates = await assertBookingOperationalGates(bookingId, opts);
  if (!gates.ok) {
    return gates;
  }

  const statuses = opts?.includeCompletedReservations
    ? (['active', 'hold', 'completed'] as const)
    : (['active', 'hold'] as const);

  const [reservation] = await db
    .select({ status: bedReservations.status })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, bookingId),
        eq(bedReservations.kind, 'primary'),
        inArray(bedReservations.status, [...statuses]),
      ),
    )
    .limit(1);

  if (!reservation) {
    return {
      ok: false,
      code: 'reservation_not_active',
      reason: 'No primary reservation to restore.',
    };
  }

  if (!isReservationStatusEligibleForOccupancy(reservation.status) && reservation.status !== 'completed') {
    return {
      ok: false,
      code: 'reservation_not_active',
      reason: 'Reservation is not active.',
    };
  }

  return { ok: true };
}

/**
 * Full eligibility check for an active bed reservation to count as occupancy.
 * Used before restoring stays and when validating operational occupancy.
 */
export async function assertBookingEligibleForBedOccupancy(
  bookingId: string,
  opts?: { skipKyc?: boolean },
): Promise<OccupancyEligibilityResult> {
  const gates = await assertBookingOperationalGates(bookingId, opts);
  if (!gates.ok) {
    return gates;
  }

  const today = formatDate(new Date());
  const [reservation] = await db
    .select({ status: bedReservations.status })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, bookingId),
        eq(bedReservations.kind, 'primary'),
        inArray(bedReservations.status, ['hold', 'active']),
        sql`${today}::date <@ ${bedReservations.stayRange}`,
      ),
    )
    .limit(1);

  if (!reservation) {
    return {
      ok: false,
      code: 'stay_not_covering_today',
      reason: 'No active primary reservation covering today.',
    };
  }

  if (!isReservationStatusEligibleForOccupancy(reservation.status)) {
    return {
      ok: false,
      code: 'reservation_not_active',
      reason: 'Reservation is not active.',
    };
  }

  return { ok: true };
}
