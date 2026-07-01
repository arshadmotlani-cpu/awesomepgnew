/* eslint-disable no-console */
/**
 * Emergency production repair: free Neon disk (app_logs bloat) and sync Dhruv's paid electricity invoice.
 *
 * Usage:
 *   export $(grep DATABASE_URL .env.local | xargs)
 *   npx tsx scripts/repair-prod-disk-and-sync-dhruv-electricity.ts
 */
import { eq, sql } from 'drizzle-orm';
import { closeDb, createClient } from '../src/db/client';
import { electricityInvoices } from '../src/db/schema';
import { setLogPersistenceEnabled } from '../src/lib/monitoring/logStore';
import { syncElectricityInvoiceToUnified } from '../src/services/unifiedInvoices';

const DHRUV_INVOICE_ID = '2cf7b2b0-842c-4aeb-bf55-2335751c6a0f';

async function main() {
  setLogPersistenceEnabled(false);
  const { db, close } = createClient({ max: 1 });

  const before = await db.execute(sql`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
           (SELECT count(*)::bigint FROM app_logs) AS app_logs_count
  `);
  console.log('Before:', before[0]);

  console.log('Truncating app_logs (469MB+ SQL trace bloat blocking all INSERTs)...');
  await db.execute(sql`TRUNCATE TABLE app_logs`);
  await db.execute(sql`VACUUM ANALYZE app_logs`);

  const after = await db.execute(sql`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
           (SELECT count(*)::bigint FROM app_logs) AS app_logs_count
  `);
  console.log('After truncate:', after[0]);

  const [invoice] = await db
    .select({
      id: electricityInvoices.id,
      status: electricityInvoices.status,
      invoiceNumber: electricityInvoices.invoiceNumber,
    })
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, DHRUV_INVOICE_ID))
    .limit(1);

  if (!invoice) {
    console.error('Dhruv electricity invoice not found:', DHRUV_INVOICE_ID);
    await close();
    return;
  }
  console.log('Electricity invoice:', invoice);

  if (invoice.status !== 'paid') {
    console.error('Invoice is not paid — run approval first');
    await close();
    process.exit(1);
  }

  const financialId = await syncElectricityInvoiceToUnified(invoice.id);
  console.log('Synced financial_invoices id:', financialId);

  const fi = await db.execute(sql`
    SELECT id, status, amount_paise, invoice_number
    FROM financial_invoices
    WHERE source_table = 'electricity_invoices' AND source_id = ${invoice.id}::uuid
  `);
  console.log('Financial invoice row:', fi[0]);

  await close();
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
