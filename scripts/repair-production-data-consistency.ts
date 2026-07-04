#!/usr/bin/env npx tsx
/**
 * Idempotent production data repair — safe to run multiple times.
 *
 *   npx tsx scripts/repair-production-data-consistency.ts
 *   npx tsx scripts/repair-production-data-consistency.ts --dry-run
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
import { closeDb } from '@/src/db/client';
import { hasDatabaseUrl } from '@/src/lib/db/env';
import {
  formatProductionDataConsistencyReport,
  runProductionDataConsistencyAudit,
  runProductionDataConsistencyRepair,
  type ProductionDataConsistencyRepairResult,
} from '@/src/services/productionDataConsistencyAudit';
import {
  formatSurfaceVerificationReport,
  verifyProductionSurfaceParity,
} from '@/src/services/productionDataConsistencyVerification';

if (!hasDatabaseUrl()) {
  loadAppEnv();
}

const DRY_RUN = process.argv.includes('--dry-run');

function formatFinalRepairReport(input: {
  beforeIssues: number;
  afterIssues: number;
  repair: ProductionDataConsistencyRepairResult;
  surfaceBefore: Awaited<ReturnType<typeof verifyProductionSurfaceParity>>;
  surfaceAfter: Awaited<ReturnType<typeof verifyProductionSurfaceParity>>;
}): string {
  const lines: string[] = [];
  lines.push('# Production Data Repair Report');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Rows repaired: ${input.repair.rowsRepaired}`);
  lines.push(`- Tables updated: ${input.repair.tablesUpdated.join(', ') || 'none'}`);
  lines.push(`- Issues before: ${input.beforeIssues}`);
  lines.push(`- Issues after: ${input.afterIssues}`);
  lines.push('');
  lines.push('## Repair breakdown');
  lines.push(`- Ghost manual_occupied cleared: ${input.repair.ghostCleared}`);
  lines.push(`- Orphan reservations closed: ${input.repair.orphansClosed}`);
  lines.push(`- Duplicate payments deduped: ${input.repair.paymentsDeduped}`);
  lines.push(`- Duplicate action items resolved: ${input.repair.actionItemsResolved}`);
  lines.push(`- Maintenance metadata backfilled: ${input.repair.maintenanceBackfilled}`);
  lines.push(`- Checkout settlements created: ${input.repair.checkoutSettlementsCreated}`);
  lines.push(
    `- Occupancy reservations reactivated: ${input.repair.occupancyReconstruction.reservationsReactivated}`,
  );
  lines.push(
    `- Occupancy stay ranges extended: ${input.repair.occupancyReconstruction.stayRangesExtended}`,
  );
  lines.push(
    `- Stale manual_occupied cleared: ${input.repair.occupancyReconstruction.manualFlagsCleared}`,
  );
  lines.push(`- Bookings reconciled: ${input.repair.occupancyReconstruction.bookingsReconciled}`);
  lines.push(`- Occupancy rebuild: ${JSON.stringify(input.repair.rebuild)}`);
  lines.push('');
  lines.push('## Occupancy reconstruction (Central / IT Park)');
  lines.push(`PGs: ${input.repair.occupancyReconstruction.pgNames.join(', ') || 'none matched'}`);
  for (const action of input.repair.occupancyReconstruction.actions) {
    if (action.action === 'skipped' && !action.bookingCode) continue;
    lines.push(
      `- [${action.action}] ${action.pgName} ${action.bookingCode || action.bedCode}: ${action.reason}`,
    );
  }
  lines.push('');
  if (input.repair.checkoutSettlementsUnrepairable.length > 0) {
    lines.push('## Could not repair automatically');
    for (const row of input.repair.checkoutSettlementsUnrepairable) {
      lines.push(`- ${row.bookingCode} (${row.customerName}): ${row.reason}`);
    }
    lines.push('');
  } else {
    lines.push('## Could not repair automatically');
    lines.push('- None');
    lines.push('');
  }
  lines.push(formatSurfaceVerificationReport(input.surfaceAfter));
  lines.push('');
  lines.push('## Before/after PG availability');
  lines.push('| PG | Before avail/occ/maint | After avail/occ/maint | Surfaces match |');
  lines.push('|----|------------------------|----------------------|----------------|');
  for (const after of input.surfaceAfter.rows) {
    const before = input.surfaceBefore.rows.find((r) => r.pgId === after.pgId);
    lines.push(
      `| ${after.pgName} | ${before?.adminAvailable ?? '?'}/${before?.adminOccupied ?? '?'}/${before?.adminMaintenance ?? '?'} | ${after.adminAvailable}/${after.adminOccupied}/${after.adminMaintenance} | ${after.match ? 'YES' : 'NO'} |`,
    );
  }
  return lines.join('\n');
}

async function main() {
  if (!hasDatabaseUrl()) {
    console.error('No DATABASE_URL.');
    process.exit(1);
  }

  const surfaceBefore = await verifyProductionSurfaceParity();
  const before = await runProductionDataConsistencyAudit();
  console.log(formatProductionDataConsistencyReport(before));
  console.log(`\nIssues before repair: ${before.issueTotal}`);
  console.log('\n' + formatSurfaceVerificationReport(surfaceBefore));

  if (DRY_RUN) {
    console.log('\nDry run — no writes.');
    await closeDb();
    return;
  }

  const repair = await runProductionDataConsistencyRepair(before);
  const after = await runProductionDataConsistencyAudit();
  const surfaceAfter = await verifyProductionSurfaceParity();

  console.log('\n' + formatFinalRepairReport({
    beforeIssues: before.issueTotal,
    afterIssues: after.issueTotal,
    repair,
    surfaceBefore,
    surfaceAfter,
  }));

  await closeDb();
  const exitCode = after.issueTotal > 0 || !surfaceAfter.allMatch ? 1 : 0;
  process.exit(exitCode);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
