/**
 * SSOT for "is this bed currently occupied?" — used by maintenance, disable,
 * mark unavailable, delete bed, admin bed marks, and inventory status changes.
 *
 * All occupancy checks use parameterized raw SQL with `br` / `bk` aliases.
 * Do not duplicate this logic with Drizzle `.innerJoin(bookings, …)`.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

export const BED_OCCUPIED_MESSAGE = 'This bed currently has an active resident.';
export const BED_MAINTENANCE_MARKED_MESSAGE = 'Bed marked under maintenance.';
export const BED_STATUS_SAVE_ERROR =
  'Could not update bed status. Please try again in a moment.';

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
        AND br.status IN ('hold', 'active')
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
      AND br.status IN ('hold', 'active')
      AND bk.status = 'confirmed'
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

/** Unpaid checkout hold still on the bed after stale-hold cleanup. */
export async function findPendingPaymentHold(
  bedId: string,
): Promise<{ bookingCode: string } | null> {
  const result = await db.execute<{ booking_code: string }>(sql`
    SELECT bk.booking_code
    FROM bed_reservations br
    INNER JOIN bookings bk ON bk.id = br.booking_id
    WHERE br.bed_id = ${bedId}::uuid
      AND br.status = 'hold'
      AND bk.status = 'pending_payment'
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
      AND br.status = 'hold'
      AND bk.status = 'pending_payment'
      AND CURRENT_DATE <@ br.stay_range
  `);
  return rowsOf(result).map((row) => ({
    reservationId: row.reservation_id,
    bookingId: row.booking_id,
  }));
}

/** Never surface raw SQL / Drizzle query text in bed-status UI. */
export function sanitizeBedStatusError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (
    message === BED_OCCUPIED_MESSAGE ||
    message === BED_MAINTENANCE_MARKED_MESSAGE ||
    message.startsWith('Bed has confirmed booking') ||
    message.startsWith('Bed has unpaid checkout') ||
    message.startsWith('Cannot remove this bed') ||
    message.startsWith('Cannot remove this room')
  ) {
    return message;
  }

  if (/Failed query:/i.test(message) || /syntax error at or near/i.test(message)) {
    if (/bed_reservations|bookings/i.test(message)) {
      return BED_STATUS_SAVE_ERROR;
    }
    return BED_STATUS_SAVE_ERROR;
  }

  return message;
}
