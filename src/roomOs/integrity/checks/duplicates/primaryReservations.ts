/**
 * DUP_PRIMARY_RESERVATION — multiple active primary reservations per booking.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, floors, rooms } from '@/src/db/schema';
import type { DuplicateFinding, PreflightCheckContext } from '@/src/roomOs/integrity/types';

export async function checkDuplicatePrimaryReservations(
  ctx: PreflightCheckContext,
): Promise<DuplicateFinding[]> {
  const bookingFilter = ctx.scope.bookingId
    ? sql`AND br.booking_id = ${ctx.scope.bookingId}::uuid`
    : sql``;

  const rows = await db.execute<{
    booking_id: string;
    cnt: number;
    reservation_ids: string;
  }>(sql`
    SELECT
      br.booking_id,
      COUNT(*)::int AS cnt,
      array_agg(br.id::text ORDER BY br.id) AS reservation_ids
    FROM bed_reservations br
    INNER JOIN beds b ON b.id = br.bed_id
    INNER JOIN rooms r ON r.id = b.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE br.kind = 'primary'
      AND br.status IN ('hold', 'active', 'under_review')
      AND f.pg_id = ${ctx.scope.pgId}::uuid
      ${bookingFilter}
    GROUP BY br.booking_id
    HAVING COUNT(*) > 1
  `);

  return rows.map((row) => {
    const entityIds = String(row.reservation_ids)
      .replace(/[{}]/g, '')
      .split(',')
      .filter(Boolean);
    return {
      kind: 'primary_reservation' as const,
      severity: 'block' as const,
      entityIds,
      naturalKey: `booking:${row.booking_id}:primary_reservation`,
      reasonCode: 'DUP_PRIMARY_RESERVATION',
      description: `Booking ${row.booking_id} has ${row.cnt} active primary reservations.`,
    };
  });
}

/** Bed-level active primary bookings today (supports INV_BED_DOUBLE_OCCUPIED). */
export async function listActiveBookingIdsOnBed(bedId: string): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ bookingId: bedReservations.bookingId })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bedId, bedId),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
        sql`${today}::date <@ ${bedReservations.stayRange}`,
      ),
    );
  return [...new Set(rows.map((r) => r.bookingId))];
}

export async function countActiveBookingsOnBed(bedId: string): Promise<number> {
  return (await listActiveBookingIdsOnBed(bedId)).length;
}
