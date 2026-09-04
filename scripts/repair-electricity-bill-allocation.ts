/**
 * Generic September electricity allocation reconcile (BILL_AMOUNT_MISMATCH).
 *
 * Usage:
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-electricity-bill-allocation.ts --month 2026-09-01 --dry-run
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-electricity-bill-allocation.ts --month 2026-09-01 --execute
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('repair-electricity-bill-allocation');

function parseArgs(argv: string[]) {
  let month = '2026-09-01';
  let execute = false;
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--month') month = argv[++i] ?? month;
    else if (argv[i] === '--execute') execute = true;
    else if (argv[i] === '--dry-run') execute = false;
  }
  return { month, execute };
}

async function main(): Promise<void> {
  const { month, execute } = parseArgs(process.argv);
  const { closeDb } = await import('../src/db/client');
  const {
    listElectricityBillsNeedingAllocationReconcile,
    repairElectricityBillAllocation,
    formatAllocationReconcilePreviewSummary,
  } = await import('../src/services/repairElectricityBillAllocation');
  const {
    listCompletedVacatingOpenStayRanges,
    repairCompletedVacatingOpenStayRanges,
  } = await import('../src/services/repairCompletedVacatingOpenStayRanges');

  try {
    const openStays = await listCompletedVacatingOpenStayRanges();
    console.log(`Open-ended completed vacating stays: ${openStays.length}`);
    for (const row of openStays) {
      console.log(
        `  ${row.bookingCode} ${row.customerName} vacate ${row.vacatingDate} → end ${row.exclusiveEnd}`,
      );
    }

    if (execute && openStays.length > 0) {
      const stayRepair = await repairCompletedVacatingOpenStayRanges({ dryRun: false });
      console.log(`Stay-range repairs applied: ${stayRepair.repaired}`);
    }

    const previews = await listElectricityBillsNeedingAllocationReconcile(month);
    console.log(formatAllocationReconcilePreviewSummary(previews));

    if (!execute) {
      console.log('\nDry-run only. Re-run with --execute to mutate.');
      console.log('Production mutation count: 0');
      return;
    }

    let reconciled = 0;
    let noop = 0;
    let failed = 0;
    let cancelled = 0;
    let created = 0;
    for (const preview of previews) {
      const result = await repairElectricityBillAllocation({
        billId: preview.billId,
        dryRun: false,
      });
      if (!result.ok) {
        failed += 1;
        console.error(`FAIL ${preview.pgName} Room ${preview.roomNumber}: ${result.message}`);
        continue;
      }
      if (result.kind === 'noop') {
        noop += 1;
        continue;
      }
      reconciled += 1;
      cancelled += result.cancelledInvoiceIds.length;
      created += result.createdInvoiceIds.length;
      console.log(
        `RECONCILED ${preview.pgName} Room ${preview.roomNumber} · ` +
          `cancel ${result.cancelledInvoiceIds.length} · ` +
          `update ${result.updatedInvoiceIds.length} · ` +
          `create ${result.createdInvoiceIds.length}`,
      );
    }
    console.log(
      `\nDone. reconciled=${reconciled} noop=${noop} failed=${failed} ` +
        `cancelledInvoices=${cancelled} createdInvoices=${created}`,
    );
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
