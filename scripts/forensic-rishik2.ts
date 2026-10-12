/* eslint-disable no-console */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('forensic-rishik2.ts');

import { sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';

const BID = '90c6fd25-bf5b-41c4-9b34-527bfe9c969a';

async function main() {
  const profile = await db.execute(sql`
    SELECT billing_day, billing_cycle_policy, billing_cycle_migrated_at, billing_cycle_migration_note
    FROM resident_billing_profiles WHERE booking_id = ${BID}::uuid
  `);
  console.log('profile', JSON.stringify(profile, null, 2));

  const payments = await db.execute(sql`
    SELECT id, purpose, amount_paise, status, paid_at, created_at
    FROM payments WHERE booking_id = ${BID}::uuid
    ORDER BY created_at DESC LIMIT 12
  `);
  console.log('payments', JSON.stringify(payments, null, 2));

  const fin = await db.execute(sql`
    SELECT id, invoice_number, amount_paise, status, notes, created_at
    FROM financial_invoices
    WHERE booking_id = ${BID}::uuid
    ORDER BY created_at DESC LIMIT 15
  `);
  console.log('financial_invoices', JSON.stringify(fin, null, 2));

  await closeDb();
}
main();
