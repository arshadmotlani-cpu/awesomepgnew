/* eslint-disable no-console */
/**
 * Find residents matching mid-cycle room/rent/deposit scenario (read-only).
 * USE_PRODUCTION_DB=1 npx tsx scripts/forensic-midcycle-deposit-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('forensic-midcycle-deposit');

import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bookings } from '../src/db/schema';
import { paiseToInr } from '../src/lib/format';

async function main() {
  console.log('\n=== Candidates: current rent ~3606 + deposit history ~4120 ===\n');
  const candidates = await db.execute<{
    booking_code: string;
    customer_name: string;
    room_number: string;
    bed_code: string;
    rent_paise: number;
    deposit_held: number | null;
  }>(sql`
    SELECT DISTINCT ON (bk.id)
      bk.booking_code,
      c.full_name AS customer_name,
      r.room_number,
      b.bed_code,
      rbp.rent_amount_paise AS rent_paise,
      (SELECT coalesce(sum(amount_paise),0)::bigint FROM deposit_ledger dle
       WHERE dle.booking_id = bk.id) AS deposit_held
    FROM bookings bk
    INNER JOIN customers c ON c.id = bk.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = bk.id AND br.kind = 'primary' AND br.status = 'active'
    INNER JOIN beds b ON b.id = br.bed_id
    INNER JOIN rooms r ON r.id = b.room_id
    LEFT JOIN resident_billing_profiles rbp ON rbp.booking_id = bk.id
    WHERE bk.status = 'confirmed' AND bk.is_test = false AND c.is_test = false
      AND rbp.rent_amount_paise BETWEEN 360000 AND 361000
    ORDER BY bk.id, lower(br.stay_range) DESC
  `);
  console.log(candidates);

  console.log('\n=== Open financial_invoices: room_change_deposit ===\n');
  const depositBills = await db.execute(sql`
    SELECT fi.id::text, fi.invoice_number, fi.amount_paise, fi.status, fi.source_table,
           fi.created_at::text, bk.booking_code, c.full_name,
           fi.breakdown, fi.notes
    FROM financial_invoices fi
    INNER JOIN bookings bk ON bk.id = fi.booking_id
    INNER JOIN customers c ON c.id = bk.customer_id
    WHERE fi.source_table IN ('room_change_deposit', 'deposit_difference', 'deposit_adjustment')
      AND fi.status NOT IN ('paid', 'cancelled', 'void')
    ORDER BY fi.created_at DESC
    LIMIT 40
  `);
  for (const row of depositBills) console.log(JSON.stringify(row));

  console.log('\n=== Room change requests with 412080 in quote ===\n');
  const rcr = await db.execute(sql`
    SELECT rcr.id::text, bk.booking_code, c.full_name, rcr.status,
           rcr.requested_shift_date::text, rcr.quote_snapshot
    FROM room_change_requests rcr
    INNER JOIN bookings bk ON bk.id = rcr.booking_id
    INNER JOIN customers c ON c.id = bk.customer_id
    WHERE rcr.quote_snapshot::text LIKE '%412080%'
       OR rcr.quote_snapshot::text LIKE '%360600%'
    ORDER BY rcr.created_at DESC
    LIMIT 20
  `);
  for (const row of rcr) console.log(JSON.stringify(row));

  console.log('\n=== room_configuration_schedules with rent 360600 or 412080 ===\n');
  const sched = await db.execute(sql`
    SELECT s.id::text, r.room_number, s.effective_from::text, s.status,
           s.target_bed_count, s.monthly_rate_paise, s.monthly_deposit_paise,
           bk.booking_code, c.full_name
    FROM room_configuration_schedules s
    INNER JOIN rooms r ON r.id = s.room_id
    LEFT JOIN bed_reservations br ON br.room_id = s.room_id AND br.status = 'active'
    LEFT JOIN bookings bk ON bk.id = br.booking_id
    LEFT JOIN customers c ON c.id = bk.customer_id
    WHERE s.monthly_rate_paise IN (412080, 412100, 360600)
       OR s.monthly_deposit_paise IN (412080, 412100, 360600)
    ORDER BY s.effective_from DESC
    LIMIT 30
  `);
  for (const row of sched) console.log(JSON.stringify(row));

  const codeArg = process.argv[2];
  if (codeArg) {
    const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, codeArg)).limit(1);
    if (!bk) {
      console.log('Booking not found', codeArg);
      await closeDb();
      return;
    }
    console.log('\n========== DEEP DIVE', codeArg, '==========\n');
    const timeline = await db.execute(sql`
      SELECT 'rent_invoice' AS kind, ri.invoice_number AS ref, ri.invoice_subtype AS subtype,
             ri.billing_month::text, ri.rent_paise AS amount_paise, ri.status,
             ri.paid_principal_paise, ri.notes, ri.created_at::text
      FROM rent_invoices ri WHERE ri.booking_id = ${bk.id}
      UNION ALL
      SELECT 'financial_invoice', fi.invoice_number, fi.source_table, fi.due_date::text,
             fi.amount_paise, fi.status, 0, fi.notes, fi.created_at::text
      FROM financial_invoices fi WHERE fi.booking_id = ${bk.id}
      UNION ALL
      SELECT 'credit_ledger', rcl.id::text, rcl.entry_kind::text, rcl.created_at::text,
             rcl.amount_paise, 'posted', 0, rcl.reason, rcl.created_at::text
      FROM resident_credit_ledger rcl WHERE rcl.booking_id = ${bk.id}
      UNION ALL
      SELECT 'deposit_ledger', dle.id::text, dle.entry_kind, dle.created_at::text,
             dle.amount_paise, 'posted', 0, dle.reason, dle.created_at::text
      FROM deposit_ledger dle WHERE dle.booking_id = ${bk.id}
      ORDER BY created_at
    `);
    for (const row of timeline) {
      console.log(row.kind, row.ref, row.subtype, paiseToInr(Number(row.amount_paise)), row.status, row.notes?.slice?.(0, 60));
    }
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
