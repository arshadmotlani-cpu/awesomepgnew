/* eslint-disable no-console */
/**
 * Generate missing October 2026 rent via generateRentInvoicesForMonth (SSOT).
 *   npx tsx scripts/generate-october-2026-rent-production.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('generate-october-2026-rent-production.ts');

async function main() {
  const { closeDb } = await import('../src/db/client');
  const { generateRentInvoicesForMonth } = await import('../src/services/rentInvoices');

  const billingMonth = '2026-10-01';
  const asOf = '2026-10-01';

  console.log('Calling generateRentInvoicesForMonth…', { billingMonth, asOf, forceAll: true });
  const result = await generateRentInvoicesForMonth({
    billingMonth,
    forceAll: true,
    asOf,
    collectionDueDay: 15,
  });
  console.log('Result:', result);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  const { closeDb } = await import('../src/db/client');
  await closeDb().catch(() => undefined);
  process.exit(1);
});
