/**
 * Checkout electricity — server-side room context + DB lookups.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, bookings } from '@/src/db/schema';
import { occupancyReservationCoreSql_b } from '@/src/lib/occupancySsot';
import { asPlainNumber } from '@/src/lib/format';

export type { CheckoutElectricityCalc, ElectricityCalculationMethod } from '@/src/lib/checkout/electricitySettlementCalc';
export {
  calculateAverageBillingElectricity,
  calculateCheckoutElectricity,
  calculateManualElectricityCharge,
  defaultElectricityRatePaise,
  effectiveSharingCount,
} from '@/src/lib/checkout/electricitySettlementCalc';

export type RoomOccupancyContext = {
  autoDetectedCount: number;
  occupantNames: string[];
  roomCapacity: number;
  roomNumber: string;
  source: string;
  isSingleOccupancy: boolean;
};

/** Active residents in the same room today — used for electricity sharing. */
export async function resolveRoomOccupancyContext(
  bookingId: string,
): Promise<RoomOccupancyContext> {
  const rows = await db.execute<{
    full_name: string;
    room_number: string;
    room_capacity: number;
  }>(sql`
    WITH ctx AS (
      SELECT bd.room_id, r.room_number,
        (
          SELECT count(*)::int FROM beds b_count
          WHERE b_count.room_id = bd.room_id AND b_count.archived_at IS NULL
        ) AS room_capacity
      FROM bookings b
      INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN rooms r ON r.id = bd.room_id
      WHERE b.id = ${bookingId}::uuid
      LIMIT 1
    )
    SELECT DISTINCT c.full_name, ctx.room_number, ctx.room_capacity
    FROM ctx
    INNER JOIN beds bd ON bd.room_id = ctx.room_id
    INNER JOIN bed_reservations br ON br.bed_id = bd.id
    INNER JOIN bookings b ON b.id = br.booking_id
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE ${occupancyReservationCoreSql_b}
    ORDER BY c.full_name ASC
  `);

  const list = Array.from(rows);
  const roomNumber = list[0]?.room_number ?? '—';
  const roomCapacity = Math.max(1, asPlainNumber(list[0]?.room_capacity ?? 1));
  const occupantNames = list.map((r) => r.full_name);
  const autoDetectedCount = Math.max(1, occupantNames.length);

  return {
    autoDetectedCount,
    occupantNames,
    roomCapacity,
    roomNumber,
    source: 'Active residents in room (bed_reservations SSOT)',
    isSingleOccupancy: roomCapacity <= 1,
  };
}

/** @deprecated Use resolveRoomOccupancyContext().autoDetectedCount */
export async function resolveRoomMonthlyOccupantCount(bookingId: string): Promise<number> {
  const ctx = await resolveRoomOccupancyContext(bookingId);
  return ctx.autoDetectedCount;
}

/** Resolve room id for a booking's primary bed. */
export async function bookingRoomId(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ roomId: beds.roomId })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(and(eq(bookings.id, bookingId), eq(bedReservations.kind, 'primary')))
    .limit(1);
  return row?.roomId ?? null;
}
