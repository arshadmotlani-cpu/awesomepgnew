/**
 * DUP_RESIDENCY_OPEN — customer with multiple open residency lifecycles.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import type { DuplicateFinding, PreflightCheckContext } from '@/src/roomOs/integrity/types';
import { loadBookingCustomerId } from '@/src/roomOs/integrity/checks/readers/resolvePgForRoom';

export async function checkOpenResidencyDuplicates(
  ctx: PreflightCheckContext,
): Promise<DuplicateFinding[]> {
  const customerId =
    ctx.scope.customerId ??
    (ctx.scope.bookingId ? await loadBookingCustomerId(ctx.scope.bookingId) : null);
  if (!customerId) return [];

  const activeTenancy = await getActiveTenancyForCustomer(customerId);
  if (!activeTenancy?.bookingId) return [];

  if (ctx.scope.bookingId && activeTenancy.bookingId === ctx.scope.bookingId) {
    return [];
  }

  const rows = await db.execute<{ pg_id: string; cnt: number; booking_ids: string }>(sql`
    SELECT
      f.pg_id,
      COUNT(DISTINCT b.id)::int AS cnt,
      array_agg(DISTINCT b.id::text) AS booking_ids
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.status = 'active'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE b.customer_id = ${customerId}::uuid
      AND b.status = 'confirmed'
      AND f.pg_id = ${ctx.scope.pgId}::uuid
    GROUP BY f.pg_id
    HAVING COUNT(DISTINCT b.id) > 1
  `);

  if (rows.length === 0 && activeTenancy.pgId === ctx.scope.pgId) {
    return [
      {
        kind: 'residency_open',
        severity: 'warn',
        entityIds: [activeTenancy.bookingId],
        naturalKey: `customer:${customerId}:residency_open`,
        reasonCode: 'DUP_RESIDENCY_OPEN',
        description: `Customer ${customerId} already has open residency on booking ${activeTenancy.bookingId}.`,
      },
    ];
  }

  return rows.flatMap((row) => {
    const entityIds = String(row.booking_ids)
      .replace(/[{}]/g, '')
      .split(',')
      .filter(Boolean);
    return [
      {
        kind: 'residency_open' as const,
        severity: 'warn' as const,
        entityIds,
        naturalKey: `customer:${customerId}:residency_open`,
        reasonCode: 'DUP_RESIDENCY_OPEN',
        description: `Customer ${customerId} has ${row.cnt} open confirmed bookings in this property.`,
      },
    ];
  });
}
