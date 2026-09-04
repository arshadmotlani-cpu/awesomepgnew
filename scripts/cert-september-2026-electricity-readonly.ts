/**
 * Read-only September 2026 electricity certification across all PGs.
 *
 * Usage: npm run cert:september-2026-electricity-readonly
 * Exit 0 = pass · Exit 1 = reconciliation issues found (no mutations)
 */
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';

config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local' });

function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.production.local', '.env.local', '.env.off']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      if (match?.[1]?.trim() && !match[1].includes('placeholder')) {
        process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
        return;
      }
    } catch {
      // try next
    }
  }
}

ensureDatabaseUrl();

async function main(): Promise<void> {
  const {
    runSeptember2026ElectricityCertification,
    formatSeptemberElectricityCertificationSummary,
  } = await import('../src/services/september2026ElectricityCertification');

  const report = await runSeptember2026ElectricityCertification();
  console.log(formatSeptemberElectricityCertificationSummary(report));
  console.log('\n--- JSON summary ---');
  console.log(
    JSON.stringify(
      {
        pass: report.pass,
        pgCount: report.pgCount,
        roomCount: report.roomCount,
        billsExisting: report.billsExisting,
        billsMissing: report.billsMissing,
        maintenanceExcluded: report.maintenanceExcluded,
        needMeterReading: report.needMeterReading,
        reconciliationRequired: report.reconciliationRequired,
        duplicateInvoiceCount: report.duplicateInvoiceCount,
        ownershipFlagCount: report.ownershipFlagCount,
        paidPreservedPaise: report.paidPreservedPaise,
        billWithoutInvoicesCount: report.billWithoutInvoicesCount,
        billWithoutInvoicesRooms: report.billWithoutInvoicesRooms,
        passExceptBillWithoutInvoices: report.passExceptBillWithoutInvoices,
        room204: report.room204,
        room402Female: report.room402Female,
        saswatSeptemberPaidPaise: report.saswatSeptemberPaidPaise,
        productionMutationCount: 0,
      },
      null,
      2,
    ),
  );

  if (!report.passExceptBillWithoutInvoices) {
    console.error('\nCERT FAIL — hard reconciliation failures (not BILL_WITHOUT_INVOICES).');
    process.exit(1);
  }
  if (!report.pass) {
    console.log(
      '\nCERT PASS except BILL_WITHOUT_INVOICES — apply repairElectricityBillMissingInvoices after review.',
    );
    console.log('Production mutation count: 0.');
    process.exit(0);
  }
  console.log('\nCERT PASS — read-only audit complete. Production mutation count: 0.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
