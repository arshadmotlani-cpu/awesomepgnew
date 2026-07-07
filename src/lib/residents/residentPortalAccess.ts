/**
 * Resident portal vs reservation lifecycle — routing SSOT.
 *
 * Resident Home (current stay, billing, deposit, move-out) unlocks ONLY for
 * confirmed non-reserve bookings with an active bed assignment.
 *
 * An open bed reservation (draft → confirmed hold) must never unlock resident portal,
 * even when the customer has a historical completed stay.
 */

import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, bedReserveHolds, bookings } from '@/src/db/schema';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';

/** True while customer is in the reserve funnel (not yet converted to a stay). */
export async function customerHasOpenReserveLifecycle(customerId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .leftJoin(bedReserveHolds, eq(bedReserveHolds.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.customerId, customerId),
        eq(bookings.durationMode, 'reserve'),
        inArray(bookings.status, ['draft', 'pending_payment', 'pending_approval']),
        or(
          sql`${bedReserveHolds.id} IS NULL`,
          inArray(bedReserveHolds.status, ['pending_payment', 'under_review', 'active']),
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Confirmed non-reserve booking with active primary bed assignment.
 * Excludes completed/cancelled and reserve holds.
 */
export async function customerHasActiveConfirmedStay(customerId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .where(
      and(
        eq(bookings.customerId, customerId),
        eq(bookings.status, 'confirmed'),
        sql`${bookings.durationMode}::text <> 'reserve'`,
        eq(bedReservations.status, 'active'),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Booking code for the customer's open reserve lifecycle (for redirects). */
export async function getOpenReserveBookingCode(customerId: string): Promise<string | null> {
  const [row] = await db
    .select({ bookingCode: bookings.bookingCode })
    .from(bookings)
    .leftJoin(bedReserveHolds, eq(bedReserveHolds.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.customerId, customerId),
        eq(bookings.durationMode, 'reserve'),
        inArray(bookings.status, ['draft', 'pending_payment', 'pending_approval']),
        or(
          sql`${bedReserveHolds.id} IS NULL`,
          inArray(bedReserveHolds.status, ['pending_payment', 'under_review', 'active']),
        ),
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(1);
  return row?.bookingCode ?? null;
}

/** Resident portal (My Stay, billing, deposit) — never during open reserve lifecycle. */
export async function customerHasResidentPortalAccess(customerId: string): Promise<boolean> {
  if (await customerHasOpenReserveLifecycle(customerId)) return false;
  const tenancy = await getActiveTenancyForCustomer(customerId);
  if (!tenancy) return false;
  return tenancy.durationMode !== 'reserve';
}
