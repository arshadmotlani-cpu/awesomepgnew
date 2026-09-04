/**
 * Apply generic BILL_WITHOUT_INVOICES repair for a billing month.
 *
 * Usage:
 *   npx tsx scripts/repair-electricity-bills-without-invoices.ts --month 2026-09-01 --dry-run
 *   npx tsx scripts/repair-electricity-bills-without-invoices.ts --month 2026-09-01 --execute
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
      // next
    }
  }
}

ensureDatabaseUrl();

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
  const {
    listElectricityBillsWithoutInvoices,
    repairElectricityBillMissingInvoices,
    formatMissingInvoicePreviewSummary,
  } = await import('../src/services/repairElectricityBillMissingInvoices');

  const previews = await listElectricityBillsWithoutInvoices(month);
  console.log(formatMissingInvoicePreviewSummary(previews));

  if (!execute) {
    console.log('\nDry-run only. Re-run with --execute to mutate.');
    console.log('Production mutation count: 0');
    return;
  }

  let created = 0;
  let noop = 0;
  let failed = 0;
  for (const preview of previews) {
    const result = await repairElectricityBillMissingInvoices({
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
      console.log(`NOOP ${preview.pgName} Room ${preview.roomNumber}`);
    } else {
      created += 1;
      console.log(
        `REPAIRED ${preview.pgName} Room ${preview.roomNumber} · created ${result.createdInvoiceIds.length} invoice(s)`,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        billingMonth: month,
        cases: previews.length,
        repaired: created,
        noop,
        failed,
        productionMutationCount: created,
      },
      null,
      2,
    ),
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
