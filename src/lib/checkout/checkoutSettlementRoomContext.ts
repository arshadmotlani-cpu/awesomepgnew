/**
 * Checkout settlement room context — room at move-out, not latest bed assignment.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

export type CheckoutSettlementRoomContext = {
  roomId: string;
  roomNumber: string;
  bedCode: string;
  pgId: string;
  pgName: string;
};

/**
 * Resolve the room/bed occupied at checkout (vacating date) from primary stay_range history.
 * Does not use the resident's current bed when they have transferred rooms.
 */
export async function resolveCheckoutSettlementRoomContext(
  bookingId: string,
  vacatingDate: string,
): Promise<CheckoutSettlementRoomContext | null> {
  const rows = await db.execute<{
    room_id: string;
    room_number: string;
    bed_code: string;
    pg_id: string;
    pg_name: string;
  }>(sql`
    SELECT
      r.id::text AS room_id,
      r.room_number,
      bd.bed_code,
      p.id::text AS pg_id,
      p.name AS pg_name
    FROM bed_reservations br
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE br.booking_id = ${bookingId}::uuid
      AND br.kind = 'primary'
    ORDER BY
      CASE WHEN ${vacatingDate}::date <@ br.stay_range THEN 0 ELSE 1 END ASC,
      abs(
        extract(
          epoch FROM (
            coalesce(upper(br.stay_range), 'infinity'::timestamptz) - ${vacatingDate}::timestamp
          )
        )
      ) ASC,
      lower(br.stay_range) DESC
    LIMIT 1
  `);

  const row = rows[0];
  if (!row?.room_id) return null;
  return {
    roomId: row.room_id,
    roomNumber: row.room_number,
    bedCode: row.bed_code,
    pgId: row.pg_id,
    pgName: row.pg_name,
  };
}
