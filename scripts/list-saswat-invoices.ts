#!/usr/bin/env npx tsx
import { sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('list-saswat-invoices.ts');
import { closeDb, db } from '../src/db/client';

async function main() {
  const rows = await db.execute(sql`
    SELECT ri.invoice_number, ri.invoice_subtype, ri.billing_month::text, ri.due_date::text,
           ri.status, ri.rent_paise, ri.notes, ri.paid_at::text, ri.paid_principal_paise
    FROM rent_invoices ri JOIN bookings b ON b.id = ri.booking_id
    WHERE b.booking_code = 'APG-2026-0094'
    ORDER BY ri.billing_month
  `);
  for (const r of rows) console.log(JSON.stringify(r));
}
main().then(() => closeDb());
