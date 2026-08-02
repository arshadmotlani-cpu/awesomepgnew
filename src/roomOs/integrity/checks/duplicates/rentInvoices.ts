/**
 * DUP_RENT_INVOICE_ACTIVE — scoped rent invoice duplicate detection.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import type { DuplicateFinding, PreflightCheckContext } from '@/src/roomOs/integrity/types';

export async function checkDuplicateRentInvoices(
  ctx: PreflightCheckContext,
): Promise<DuplicateFinding[]> {
  const findings: DuplicateFinding[] = [];
  const bookingFilter = ctx.scope.bookingId
    ? sql`AND ri.booking_id = ${ctx.scope.bookingId}::uuid`
    : sql``;

  const rows = await db.execute<{
    booking_id: string;
    billing_month: string;
    cnt: number;
    invoice_ids: string;
  }>(sql`
    SELECT
      ri.booking_id,
      ri.billing_month,
      COUNT(*)::int AS cnt,
      array_agg(ri.id::text ORDER BY ri.id) AS invoice_ids
    FROM rent_invoices ri
    INNER JOIN beds b ON b.id = ri.bed_id
    INNER JOIN rooms r ON r.id = b.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE ri.status NOT IN ('cancelled')
      AND ri.is_adhoc = false
      AND f.pg_id = ${ctx.scope.pgId}::uuid
      ${bookingFilter}
    GROUP BY ri.booking_id, ri.billing_month
    HAVING COUNT(*) > 1
  `);

  for (const row of rows) {
    const entityIds = String(row.invoice_ids)
      .replace(/[{}]/g, '')
      .split(',')
      .filter(Boolean);
    findings.push({
      kind: 'rent_invoice',
      severity: 'block',
      entityIds,
      naturalKey: `booking:${row.booking_id}:month:${row.billing_month}`,
      reasonCode: 'DUP_RENT_INVOICE_ACTIVE',
      description: `Duplicate rent invoices for booking ${row.booking_id} in ${row.billing_month} (${row.cnt} rows).`,
    });
  }

  return findings;
}
