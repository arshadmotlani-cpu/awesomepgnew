/* eslint-disable no-console */
import { sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('apply-0156-standalone-invoice-enum.ts');

async function main() {
  const { db, closeDb } = await import('@/src/db/client');
  await db.execute(
    sql.raw(`ALTER TYPE financial_invoice_type ADD VALUE IF NOT EXISTS 'standalone'`),
  );
  console.log('OK: financial_invoice_type standalone');
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
