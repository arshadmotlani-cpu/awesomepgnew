#!/usr/bin/env npx tsx
/**
 * Production data consistency audit (read-only).
 *
 * On Vercel production (DATABASE_URL injected at build):
 *   npx tsx scripts/audit-production-data-consistency.ts
 *
 * Repair (idempotent):
 *   npx tsx scripts/repair-production-data-consistency.ts
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
import { closeDb } from '@/src/db/client';
import { getDatabaseHost, getDatabaseUrlSource, hasDatabaseUrl } from '@/src/lib/db/env';
import {
  formatProductionDataConsistencyReport,
  runProductionDataConsistencyAudit,
} from '@/src/services/productionDataConsistencyAudit';

if (!hasDatabaseUrl()) {
  loadAppEnv();
}

async function main() {
  if (!hasDatabaseUrl()) {
    console.error(
      'No DATABASE_URL. Run on Vercel production build or set Neon DATABASE_URL in .env.local.',
    );
    process.exit(1);
  }

  console.log(`Database: ${getDatabaseUrlSource()} @ ${getDatabaseHost() ?? 'unknown'}\n`);

  const report = await runProductionDataConsistencyAudit();
  console.log(formatProductionDataConsistencyReport(report));

  if (report.ghostOccupied.length) {
    console.log('\n### Ghost occupied beds');
    for (const r of report.ghostOccupied.slice(0, 20)) {
      console.log(`  ${r.pgName} R${r.roomNumber} ${r.bedCode}`);
    }
  }
  if (report.duplicatePendingPayments.length) {
    console.log('\n### Duplicate pending payments');
    for (const r of report.duplicatePendingPayments) {
      console.log(`  ${r.bookingCode ?? r.bookingId}: ${r.pendingCount} rows`);
    }
  }
  if (report.orphanReservations.length) {
    console.log('\n### Orphan reservations');
    for (const r of report.orphanReservations.slice(0, 15)) {
      console.log(`  ${r.bookingCode} (${r.bookingStatus}) → ${r.pgName ?? '?'} ${r.bedCode ?? '?'}`);
    }
  }
  if (report.missingCheckoutSettlements.length) {
    console.log('\n### Missing checkout settlements');
    for (const r of report.missingCheckoutSettlements.slice(0, 15)) {
      console.log(`  ${r.bookingCode} ${r.customerName}`);
    }
  }

  await closeDb();
  process.exit(report.issueTotal > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
