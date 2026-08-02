/**
 * DUP_CHECKOUT_SETTLEMENT_OPEN — multiple open checkout settlements per booking.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import type { DuplicateFinding, PreflightCheckContext } from '@/src/roomOs/integrity/types';

export async function checkDuplicateCheckoutSettlements(
  ctx: PreflightCheckContext,
): Promise<DuplicateFinding[]> {
  const bookingFilter = ctx.scope.bookingId
    ? sql`AND cs.booking_id = ${ctx.scope.bookingId}::uuid`
    : sql``;

  const rows = await db.execute<{
    booking_id: string;
    cnt: number;
    settlement_ids: string;
  }>(sql`
    SELECT
      cs.booking_id,
      COUNT(*)::int AS cnt,
      array_agg(cs.id::text ORDER BY cs.id) AS settlement_ids
    FROM checkout_settlements cs
    INNER JOIN bed_reservations br ON br.booking_id = cs.booking_id
    INNER JOIN beds b ON b.id = br.bed_id
    INNER JOIN rooms r ON r.id = b.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE cs.status NOT IN ('archived', 'completed')
      AND f.pg_id = ${ctx.scope.pgId}::uuid
      ${bookingFilter}
    GROUP BY cs.booking_id
    HAVING COUNT(*) > 1
  `);

  return rows.map((row) => {
    const entityIds = String(row.settlement_ids)
      .replace(/[{}]/g, '')
      .split(',')
      .filter(Boolean);
    return {
      kind: 'checkout_settlement' as const,
      severity: 'warn' as const,
      entityIds,
      naturalKey: `booking:${row.booking_id}:checkout_settlement`,
      reasonCode: 'DUP_CHECKOUT_SETTLEMENT_OPEN',
      description: `Booking ${row.booking_id} has ${row.cnt} open checkout settlements.`,
    };
  });
}
