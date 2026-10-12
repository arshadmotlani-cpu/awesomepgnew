/**
 * READ-ONLY: locate Sushant S Khatakalle booking + rent invoices.
 * USE_PRODUCTION_DB=1 npx tsx scripts/find-sushant-khatakalle-readonly.ts
 */
import { sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('find-sushant-khatakalle');

async function main() {
  const { db, closeDb } = await import('@/src/db/client');
  const rows = await db.execute(sql`
    SELECT c.id::text AS customer_id, c.full_name, c.phone,
           b.id::text AS booking_id, b.booking_code, b.status::text AS booking_status,
           b.duration_mode::text, b.expected_checkout_date::text,
           to_char(lower(br.stay_range), 'YYYY-MM-DD') AS check_in,
           to_char(upper(br.stay_range), 'YYYY-MM-DD') AS stay_end_exclusive,
           p.name AS pg_name, r.room_number, bd.bed_code
    FROM customers c
    JOIN bookings b ON b.customer_id = c.id
    JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    JOIN beds bd ON bd.id = br.bed_id
    JOIN rooms r ON r.id = bd.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    WHERE c.full_name ILIKE '%Khatakalle%'
    ORDER BY b.created_at DESC
  `);
  console.log('BOOKINGS', JSON.stringify(rows, null, 2));
  const inv = await db.execute(sql`
    SELECT ri.id::text, ri.invoice_number, ri.rent_paise, ri.status::text, ri.billing_month::text,
           ri.notes, ri.is_adhoc, ri.paid_principal_paise, ri.due_date::text
    FROM rent_invoices ri
    JOIN bookings b ON b.id = ri.booking_id
    JOIN customers c ON c.id = b.customer_id
    WHERE c.full_name ILIKE '%Khatakalle%'
    ORDER BY ri.created_at DESC
  `);
  console.log('INVOICES', JSON.stringify(inv, null, 2));
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
