/**
 * Idempotent repair: cancel stale room_change_pay_all invoices when all child lines are settled.
 *
 * Default: dry-run (read-only). Pass --apply to execute writes.
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('reconcile-room-change-pay-all');

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { reconcileRoomChangePayAllAfterChildSettlement } from '@/src/services/roomTransferBilling';
import { roomChangeChargesSettledFromRows } from '@/src/services/roomTransferBilling';
import { ROOM_CHANGE_INVOICE_SOURCE } from '@/src/services/roomShiftQuote';

const apply = process.argv.includes('--apply');

async function main() {
  const requestIds = (await db.execute(sql`
    SELECT DISTINCT fi.source_id::text AS request_id, bk.booking_code, c.full_name
    FROM financial_invoices fi
    JOIN bookings bk ON bk.id = fi.booking_id
    JOIN customers c ON c.id = fi.customer_id
    WHERE fi.source_table = ${ROOM_CHANGE_INVOICE_SOURCE.payAll}
      AND fi.status IN ('sent','overdue','partial','draft','payment_in_progress')
  `)) as Array<{ request_id: string; booking_code: string; full_name: string }>;

  const planned: Array<{
    requestId: string;
    bookingCode: string;
    resident: string;
    wouldCancelPayAllIds: string[];
  }> = [];

  for (const row of requestIds) {
    const invoices = (await db.execute(sql`
      SELECT source_table, status, amount_paise
      FROM financial_invoices
      WHERE source_id = ${row.request_id}::uuid
    `)) as Array<{ source_table: string; status: string; amount_paise: string }>;

    const normalized = invoices.map((inv) => ({
      sourceTable: inv.source_table,
      status: inv.status,
      amountPaise: Number(inv.amount_paise),
    }));

    if (!roomChangeChargesSettledFromRows(normalized)) continue;

    if (apply) {
      const result = await reconcileRoomChangePayAllAfterChildSettlement(row.request_id);
      planned.push({
        requestId: row.request_id,
        bookingCode: row.booking_code,
        resident: row.full_name,
        wouldCancelPayAllIds: result.cancelledPayAllIds,
      });
    } else {
      const openPayAll = (await db.execute(sql`
        SELECT id::text FROM financial_invoices
        WHERE source_id = ${row.request_id}::uuid
          AND source_table = ${ROOM_CHANGE_INVOICE_SOURCE.payAll}
          AND status IN ('sent','overdue','partial','draft','payment_in_progress')
      `)) as Array<{ id: string }>;
      planned.push({
        requestId: row.request_id,
        bookingCode: row.booking_code,
        resident: row.full_name,
        wouldCancelPayAllIds: openPayAll.map((p) => p.id),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        apply,
        mutations: apply ? planned.reduce((n, p) => n + p.wouldCancelPayAllIds.length, 0) : 0,
        affected: planned,
      },
      null,
      2,
    ),
  );

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
