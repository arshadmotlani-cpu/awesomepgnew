/**
 * SSOT for "is this bed currently occupied?" — used by maintenance, disable,
 * mark unavailable, delete bed, admin bed marks, and inventory status changes.
 *
 * All occupancy checks use parameterized raw SQL with `br` / `bk` aliases.
 * Do not duplicate this logic with Drizzle `.innerJoin(bookings, …)`.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  BED_OCCUPIED_MESSAGE,
  BED_MAINTENANCE_MARKED_MESSAGE,
  BED_STATUS_SAVE_ERROR,
  sanitizeBedStatusError,
} from '@/src/lib/bedOccupancyMessages';

export {
  BED_MAINTENANCE_MARKED_MESSAGE,
  BED_OCCUPIED_MESSAGE,
  BED_STATUS_SAVE_ERROR,
  sanitizeBedStatusError,
};

export type BlockingConfirmedBooking = {
  bookingId: string;
  bookingCode: string;
  durationMode: string;
  customerName: string | null;
};

function rowsOf<T>(result: T[] | { rows?: T[] }): T[] {
  if (Array.isArray(result)) return result;
  return result.rows ?? [];
}

/** Confirmed primary reservation covering today — operational occupancy SSOT. */
export async function isBedOccupiedToday(bedId: string): Promise<boolean> {
  const result = await db.execute<{ occupied: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM bed_reservations br
      INNER JOIN bookings bk ON bk.id = br.booking_id
      WHERE br.bed_id = ${bedId}::uuid
        AND bk.status = 'confirmed'
        AND br.status = 'active'
        AND br.kind = 'primary'
        AND CURRENT_DATE <@ br.stay_range
    ) AS occupied
  `);
  const [row] = rowsOf(result);
  return Boolean(row?.occupied);
}

export async function assertBedNotOccupiedToday(bedId: string): Promise<void> {
  if (await isBedOccupiedToday(bedId)) {
    throw new Error(BED_OCCUPIED_MESSAGE);
  }
}

/** Hold or active reservation on the bed (archive/delete guard). */
export async function hasBedActiveOrHoldReservation(bedId: string): Promise<boolean> {
  const result = await db.execute<{ blocked: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM bed_reservations br
      WHERE br.bed_id = ${bedId}::uuid
        AND br.status IN ('hold', 'under_review', 'active')
    ) AS blocked
  `);
  const [row] = rowsOf(result);
  return Boolean(row?.blocked);
}

/** Confirmed stay overlapping today that blocks admin manual marks. */
export async function findBlockingConfirmedBooking(
  bedId: string,
): Promise<BlockingConfirmedBooking | null> {
  const result = await db.execute<{
    booking_id: string;
    booking_code: string;
    duration_mode: string;
    customer_name: string | null;
  }>(sql`
    SELECT
      bk.id AS booking_id,
      bk.booking_code,
      bk.duration_mode::text AS duration_mode,
      c.full_name AS customer_name
    FROM bed_reservations br
    INNER JOIN bookings bk ON bk.id = br.booking_id
    INNER JOIN customers c ON c.id = bk.customer_id
    WHERE br.bed_id = ${bedId}::uuid
      AND br.status IN ('under_review', 'active')
      AND bk.status IN ('pending_approval', 'confirmed')
      AND CURRENT_DATE <@ br.stay_range
    LIMIT 1
  `);
  const [row] = rowsOf(result);
  if (!row) return null;
  return {
    bookingId: row.booking_id,
    bookingCode: row.booking_code,
    durationMode: row.duration_mode,
    customerName: row.customer_name,
  };
}

/** Under-review or unpaid legacy hold on the bed. */
export async function findPendingPaymentHold(
  bedId: string,
): Promise<{ bookingCode: string } | null> {
  const result = await db.execute<{ booking_code: string }>(sql`
    SELECT bk.booking_code
    FROM bed_reservations br
    INNER JOIN bookings bk ON bk.id = br.booking_id
    WHERE br.bed_id = ${bedId}::uuid
      AND br.status = 'under_review'
      AND bk.status = 'pending_approval'
      AND CURRENT_DATE <@ br.stay_range
    LIMIT 1
  `);
  const [row] = rowsOf(result);
  return row ? { bookingCode: row.booking_code } : null;
}

/** Unpaid holds to cancel before admin manual marks. */
export async function listUnpaidHoldReservations(
  bedId: string,
): Promise<Array<{ reservationId: string; bookingId: string }>> {
  const result = await db.execute<{ reservation_id: string; booking_id: string }>(sql`
    SELECT br.id AS reservation_id, bk.id AS booking_id
    FROM bed_reservations br
    INNER JOIN bookings bk ON bk.id = br.booking_id
    WHERE br.bed_id = ${bedId}::uuid
      AND br.status IN ('hold', 'under_review')
      AND bk.status IN ('pending_payment', 'pending_approval')
      AND CURRENT_DATE <@ br.stay_range
  `);
  return rowsOf(result).map((row) => ({
    reservationId: row.reservation_id,
    bookingId: row.booking_id,
  }));
}
