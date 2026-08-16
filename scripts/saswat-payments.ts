#!/usr/bin/env npx tsx
import { sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('saswat-payments.ts');
import { closeDb, db } from '../src/db/client';

async function main() {
  const rows = await db.execute(sql`
    SELECT p.id::text, p.amount_paise, p.status, p.created_at::text, p.payment_method,
           ri.invoice_number, ri.notes
    FROM payments p
    LEFT JOIN rent_invoice_payments rip ON rip.payment_id = p.id
    LEFT JOIN rent_invoices ri ON ri.id = rip.rent_invoice_id
    JOIN bookings b ON b.id = ri.booking_id OR p.booking_id = b.id
    WHERE b.booking_code = 'APG-2026-0094'
    ORDER BY p.created_at
  `);
  console.log('payments', JSON.stringify(rows));

  const booking = await db.execute(sql`
    SELECT rent_received_paise, total_paise FROM bookings b WHERE booking_code = 'APG-2026-0094'
  `);
  console.log('booking', JSON.stringify(booking[0]));
}
main().then(() => closeDb()).catch(e => { console.error(e); closeDb(); });
