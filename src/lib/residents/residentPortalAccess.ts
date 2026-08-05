/**
 * Resident portal vs reservation lifecycle — routing SSOT.
 *
 * Modern Resident Portal unlocks for confirmed non-reserve bookings with an
 * active bed assignment (current tenancy).
 *
 * Product rule (2026-08 integrity audit):
 * - Active stay ALWAYS wins over an unfinished reserve/draft.
 * - Open reserve only owns the UI when the customer has NO active stay
 *   (pre-resident funnel / historical vacated + new reserve).
 * - Orphan draft reserves must never lock a living resident out of Wallet,
 *   Payments, or the Resident Dashboard.
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

/**
 * Booking code for an open reserve that should own post-login routing.
 * Returns null when the customer already has an active non-reserve tenancy
 * (active stay wins — unfinished reserves must not hijack the portal).
 */
export async function getOpenReserveBookingCode(customerId: string): Promise<string | null> {
  const tenancy = await getActiveTenancyForCustomer(customerId);
  if (tenancy && tenancy.durationMode !== 'reserve') {
    return null;
  }

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

/**
 * Resident portal (My Stay, billing, deposit).
 * Active non-reserve tenancy unlocks the portal even if an unfinished reserve exists.
 */
export async function customerHasResidentPortalAccess(customerId: string): Promise<boolean> {
  const tenancy = await getActiveTenancyForCustomer(customerId);
  if (tenancy && tenancy.durationMode !== 'reserve') {
    return true;
  }
  // No active stay — reserve funnel must not unlock resident billing UI.
  if (await customerHasOpenReserveLifecycle(customerId)) return false;
  return false;
}
