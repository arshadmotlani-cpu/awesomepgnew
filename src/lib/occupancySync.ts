/**
 * Keeps bed_reservations aligned with booking lifecycle.
 * Prevents "map shows open, assign blocked" ghost occupancy.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, bookings, vacatingRequests } from '@/src/db/schema';
import { scheduleAvailabilityCacheInvalidation } from '@/src/lib/cache/invalidateAvailability';
import { revalidateReservationLifecycleViews } from '@/src/lib/occupancyRevalidate';
import { stayRangeExclusiveEnd } from '@/src/lib/vacating/vacatingBedSemantics';
import { clearBedAdminMarks } from '@/src/services/bookingAdminOps';

/**
 * Cancel active/hold reservations whose parent booking is no longer live
 * (completed, cancelled, refunded). Optionally scoped to one bed.
 */
export async function reconcileOrphanBedReservations(bedId?: string): Promise<number> {
  const bedFilter = bedId ? sql`AND br.bed_id = ${bedId}::uuid` : sql``;

  const result = await db.execute(sql`
    UPDATE bed_reservations br
    SET status = CASE
      WHEN bk.status = 'completed' THEN 'completed'::reservation_status
      ELSE 'cancelled'::reservation_status
    END,
    hold_expires_at = NULL,
    updated_at = now()
    FROM bookings bk
    WHERE br.booking_id = bk.id
      AND br.status IN ('hold', 'under_review', 'active')
      AND bk.status IN ('completed', 'cancelled', 'refunded')
      ${bedFilter}
    RETURNING br.id
  `);

  const rows = (result as unknown as { rows?: { id?: string; bed_id?: string }[] }).rows ?? result;
  const count = Array.isArray(rows) ? rows.length : 0;
  if (bedId && count > 0) {
    await clearBedAdminMarks(bedId);
  }
  return count;
}

/** Close active/hold reservations when the parent booking is terminal. */
export async function closeReservationsForTerminalBooking(
  bookingId: string,
): Promise<number> {
  const result = await db.execute(sql`
    UPDATE bed_reservations br
    SET status = CASE
      WHEN bk.status = 'completed' THEN 'completed'::reservation_status
      ELSE 'cancelled'::reservation_status
    END,
    hold_expires_at = NULL,
    updated_at = now()
    FROM bookings bk
    WHERE br.booking_id = bk.id
      AND br.booking_id = ${bookingId}::uuid
      AND br.status IN ('hold', 'under_review', 'active')
      AND bk.status IN ('completed', 'cancelled', 'refunded')
    RETURNING br.id
  `);

  const rows = (result as unknown as { rows?: { id?: string }[] }).rows ?? result;
  return Array.isArray(rows) ? rows.length : 0;
}

/** Align active stay_range upper bound with approved vacating final stay (exclusive end). */
export async function syncApprovedVacatingStayRange(bookingId: string): Promise<number> {
  const [vr] = await db
    .select({ vacatingDate: vacatingRequests.vacatingDate })
    .from(vacatingRequests)
    .where(
      and(eq(vacatingRequests.bookingId, bookingId), eq(vacatingRequests.status, 'approved')),
    )
    .limit(1);

  if (!vr?.vacatingDate) return 0;

  const exclusiveEnd = stayRangeExclusiveEnd(String(vr.vacatingDate));
  const result = await db.execute(sql`
    UPDATE bed_reservations
    SET
      stay_range = daterange(lower(stay_range), ${exclusiveEnd}::date, '[)'),
      updated_at = now()
    WHERE booking_id = ${bookingId}::uuid
      AND status IN ('hold', 'active')
      AND upper(stay_range) IS DISTINCT FROM ${exclusiveEnd}::date
    RETURNING id
  `);

  const rows = (result as unknown as { id?: string }[]) ?? [];
  return Array.isArray(rows) ? rows.length : 0;
}

/** Reconcile all beds touched by a booking, then clear stale manual marks. */
export async function reconcileBookingOccupancy(
  bookingId: string,
  opts?: { revalidate?: boolean },
): Promise<{ bedsTouched: string[]; orphansReconciled: number; terminalClosed: number }> {
  const bedRows = await db.execute(sql`
    SELECT DISTINCT br.bed_id AS bed_id
    FROM bed_reservations br
    WHERE br.booking_id = ${bookingId}::uuid
    UNION
    SELECT DISTINCT brh.bed_id AS bed_id
    FROM bed_reserve_holds brh
    WHERE brh.booking_id = ${bookingId}::uuid
  `);

  const terminalClosed = await closeReservationsForTerminalBooking(bookingId);
  const orphansReconciled = await reconcileOrphanBedReservations();
  const stayRangeSynced = await syncApprovedVacatingStayRange(bookingId);
  if (stayRangeSynced > 0) {
    console.info(
      `[occupancy] synced stay_range for ${stayRangeSynced} reservation(s) on booking ${bookingId}`,
    );
  }

  const bedsTouched: string[] = [];
  const beds = (bedRows as unknown as { bed_id?: string }[]) ?? [];
  for (const row of beds) {
    const id = row.bed_id;
    if (id) {
      bedsTouched.push(id);
      await clearBedAdminMarks(id);
    }
  }

  if (opts?.revalidate !== false) {
    const [booking] = await db
      .select({ bookingCode: bookings.bookingCode })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    revalidateReservationLifecycleViews({ bookingCode: booking?.bookingCode ?? null });
    scheduleAvailabilityCacheInvalidation({ bookingId });
  }

  return { bedsTouched, orphansReconciled, terminalClosed };
}
