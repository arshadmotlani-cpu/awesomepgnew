/**
 * Keeps bed_reservations aligned with booking lifecycle.
 * Prevents "map shows open, assign blocked" ghost occupancy.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, bookings } from '@/src/db/schema';
import { revalidateOccupancyViews } from '@/src/lib/occupancyRevalidate';
import { clearBedAdminMarks } from '@/src/services/bookingAdminOps';

/**
 * Cancel active/hold reservations whose parent booking is no longer live
 * (completed, cancelled, refunded). Optionally scoped to one bed.
 */
export async function reconcileOrphanBedReservations(bedId?: string): Promise<number> {
  const bedFilter = bedId ? sql`AND br.bed_id = ${bedId}::uuid` : sql``;

  const result = await db.execute(sql`
    UPDATE bed_reservations br
    SET status = 'completed', updated_at = now()
    FROM bookings bk
    WHERE br.booking_id = bk.id
      AND br.status IN ('hold', 'active')
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
    SET status = 'completed', updated_at = now()
    FROM bookings bk
    WHERE br.booking_id = bk.id
      AND br.booking_id = ${bookingId}::uuid
      AND br.status IN ('hold', 'active')
      AND bk.status IN ('completed', 'cancelled', 'refunded')
    RETURNING br.id
  `);

  const rows = (result as unknown as { rows?: { id?: string }[] }).rows ?? result;
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
  `);

  const terminalClosed = await closeReservationsForTerminalBooking(bookingId);
  const orphansReconciled = await reconcileOrphanBedReservations();

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
    revalidateOccupancyViews();
  }

  return { bedsTouched, orphansReconciled, terminalClosed };
}
