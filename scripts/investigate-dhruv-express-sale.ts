/* eslint-disable no-console */
/**
 * Audit express walk-in partial success for resident Dhruv.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.vercel.dhruv') });
config({ path: resolve(process.cwd(), '.env.vercel.prod') });
config({ path: resolve(process.cwd(), '.env.production.local') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const { closeDb, db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');

  const SEARCH = 'Dhruv';

  console.log(`\n=== Express Sale audit: ${SEARCH} ===\n`);

  const residents = await db.execute(sql`
    SELECT id, full_name, phone, residency_status, created_at, updated_at
    FROM customers
    WHERE full_name ILIKE ${'%' + SEARCH + '%'} OR phone ILIKE ${'%' + SEARCH + '%'}
  `);
  console.log('Residents:', JSON.stringify(residents, null, 2));

  const bookings = await db.execute(sql`
    SELECT
      b.id, b.booking_code, b.status, b.duration_mode, b.expected_checkout_date,
      b.total_paise, b.deposit_paise, b.deposit_due_paise, b.deposit_collection_status,
      b.created_via, b.created_by_admin_id, b.notes, b.created_at,
      br.id AS reservation_id, br.status AS reservation_status, br.stay_range,
      bd.bed_code, r.room_number, p.name AS pg_name
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    LEFT JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    LEFT JOIN beds bd ON bd.id = br.bed_id
    LEFT JOIN rooms r ON r.id = bd.room_id
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN pgs p ON p.id = f.pg_id
    WHERE c.full_name ILIKE ${'%' + SEARCH + '%'}
    ORDER BY b.created_at
  `);
  console.log('\nBookings + reservations:', JSON.stringify(bookings, null, 2));

  const payments = await db.execute(sql`
    SELECT p.id, p.booking_id, p.purpose, p.provider, p.amount_paise, p.status, p.paid_at, p.created_at
    FROM payments p
    JOIN bookings b ON b.id = p.booking_id
    JOIN customers c ON c.id = b.customer_id
    WHERE c.full_name ILIKE ${'%' + SEARCH + '%'}
    ORDER BY p.created_at
  `);
  console.log('\nPayments:', JSON.stringify(payments, null, 2));

  const rentInv = await db.execute(sql`
    SELECT ri.id, ri.invoice_number, ri.booking_id, ri.status, ri.rent_paise,
           ri.paid_principal_paise, ri.billing_month, ri.payment_id, ri.notes
    FROM rent_invoices ri
    JOIN customers c ON c.id = ri.customer_id
    WHERE c.full_name ILIKE ${'%' + SEARCH + '%'}
  `);
  console.log('\nRent invoices:', JSON.stringify(rentInv, null, 2));

  const finInv = await db.execute(sql`
    SELECT fi.id, fi.invoice_number, fi.booking_id, fi.invoice_type, fi.status,
           fi.amount_paise, fi.source_table, fi.source_id, fi.breakdown
    FROM financial_invoices fi
    JOIN customers c ON c.id = fi.customer_id
    WHERE c.full_name ILIKE ${'%' + SEARCH + '%'}
  `);
  console.log('\nFinancial invoices:', JSON.stringify(finInv, null, 2));

  const ledger = await db.execute(sql`
    SELECT dl.id, dl.booking_id, dl.entry_type, dl.amount_paise, dl.reason, dl.created_at
    FROM deposit_ledger dl
    JOIN bookings b ON b.id = dl.booking_id
    JOIN customers c ON c.id = b.customer_id
    WHERE c.full_name ILIKE ${'%' + SEARCH + '%'}
    ORDER BY dl.created_at
  `);
  console.log('\nDeposit ledger:', JSON.stringify(ledger, null, 2));

  const missingUnified = await db.execute(sql`
    SELECT ri.id AS rent_id, ri.invoice_number, ri.status, ri.rent_paise, b.booking_code, c.full_name
    FROM rent_invoices ri
    JOIN bookings b ON b.id = ri.booking_id
    JOIN customers c ON c.id = ri.customer_id
    LEFT JOIN financial_invoices fi ON fi.source_table = 'rent_invoices' AND fi.source_id = ri.id
    WHERE c.full_name ILIKE ${'%' + SEARCH + '%'} AND fi.id IS NULL
  `);
  console.log('\nRent invoices missing unified mirror:', JSON.stringify(missingUnified, null, 2));

  const byAmount = await db.execute(sql`
    SELECT b.booking_code, c.full_name, b.status, b.total_paise, b.deposit_paise,
      (SELECT coalesce(sum(amount_paise),0) FROM payments WHERE booking_id=b.id AND status='succeeded') AS paid_total
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    WHERE b.total_paise IN (99000, 66000)
       OR b.deposit_paise = 33000
       OR EXISTS (
         SELECT 1 FROM payments p
         WHERE p.booking_id = b.id AND p.amount_paise IN (99000, 33000) AND p.status = 'succeeded'
       )
    ORDER BY b.created_at DESC
    LIMIT 15
  `);
  console.log('\nBookings matching ₹990/₹330 amounts:', JSON.stringify(byAmount, null, 2));

  const audit = await db.execute(sql`
    SELECT entity, entity_id, action, diff, created_at
    FROM audit_log
    WHERE entity_id IN (
      SELECT id::text FROM customers WHERE full_name ILIKE ${'%' + SEARCH + '%'}
      UNION SELECT id::text FROM bookings b JOIN customers c ON c.id = b.customer_id WHERE c.full_name ILIKE ${'%' + SEARCH + '%'}
    )
    ORDER BY created_at DESC
    LIMIT 30
  `);
  console.log('\nRecent audit events:', JSON.stringify(audit, null, 2));

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
