/**
 * Canonical resident portal stay readiness — confirmed assignment unlocks the portal.
 * Vacating / checkout limbo does NOT mean onboarding incomplete.
 */
import type { ResidentBookingRow } from '@/src/db/queries/customer';
import { getPortalTenancyForCustomer, type ActiveTenancy } from '@/src/lib/residentActiveTenancy';
import { customerHasResidentPortalAccess } from '@/src/lib/residents/residentPortalAccess';

export type ResidentPortalStayResolution = {
  tenancy: ActiveTenancy | null;
  primaryBooking: ResidentBookingRow | null;
  hasPortalAccess: boolean;
  portalReady: boolean;
};

export function mergeTenancyIntoBooking(
  booking: ResidentBookingRow,
  tenancy: ActiveTenancy,
): ResidentBookingRow {
  if (booking.bookingId !== tenancy.bookingId) return booking;
  return {
    ...booking,
    pgId: tenancy.pgId,
    pgName: tenancy.pgName,
    roomId: tenancy.roomId,
    roomNumber: tenancy.roomNumber,
    bedCode: tenancy.bedCode,
  };
}

/**
 * Pick the booking row that should drive the resident portal for this customer.
 * Portal tenancy wins over newest-booking fallback.
 */
export function resolveCanonicalResidentPortalBooking(
  bookings: ResidentBookingRow[],
  tenancy: ActiveTenancy | null,
): ResidentBookingRow | null {
  if (bookings.length === 0) return null;
  const byTenancy =
    tenancy != null ? bookings.find((b) => b.bookingId === tenancy.bookingId) ?? null : null;
  const primary = byTenancy ?? bookings.find((b) => b.status === 'confirmed') ?? bookings[0] ?? null;
  if (!primary) return null;
  return tenancy && primary.bookingId === tenancy.bookingId
    ? mergeTenancyIntoBooking(primary, tenancy)
    : primary;
}

export async function resolveResidentPortalStay(
  customerId: string,
  bookings: ResidentBookingRow[],
): Promise<ResidentPortalStayResolution> {
  const [tenancy, hasPortalAccess] = await Promise.all([
    getPortalTenancyForCustomer(customerId),
    customerHasResidentPortalAccess(customerId),
  ]);
  const primaryBooking = resolveCanonicalResidentPortalBooking(bookings, tenancy);
  return {
    tenancy,
    primaryBooking,
    hasPortalAccess,
    portalReady: hasPortalAccess && primaryBooking != null,
  };
}

/** True when the resident has a confirmed portal stay — not merely portal access without detail. */
export function hasResidentPortalReadyStay(input: {
  hasResidentPortalAccess: boolean;
  primaryBooking: ResidentBookingRow | null;
}): boolean {
  return input.hasResidentPortalAccess && input.primaryBooking != null;
}
