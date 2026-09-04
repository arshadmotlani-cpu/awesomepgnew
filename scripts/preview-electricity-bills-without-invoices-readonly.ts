/**
 * Read-only preview of BILL_WITHOUT_INVOICES cases for a billing month.
 * Mutation count: 0.
 *
 * Usage:
 *   npm run preview:electricity-bills-without-invoices -- --month 2026-09-01
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

function parseMonth(argv: string[]): string {
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--month') return argv[i + 1] ?? '2026-09-01';
  }
  return '2026-09-01';
}

async function main(): Promise<void> {
  const month = parseMonth(process.argv);
  const {
    listElectricityBillsWithoutInvoices,
    formatMissingInvoicePreviewSummary,
  } = await import('../src/services/repairElectricityBillMissingInvoices');

  const previews = await listElectricityBillsWithoutInvoices(month);
  console.log(formatMissingInvoicePreviewSummary(previews));
  console.log('\n--- JSON ---');
  console.log(
    JSON.stringify(
      {
        billingMonth: month,
        caseCount: previews.length,
        productionMutationCount: 0,
        cases: previews.map((p) => ({
          pgName: p.pgName,
          roomNumber: p.roomNumber,
          billId: p.billId,
          roomTotalPaise: p.roomTotalPaise,
          meter: {
            previous: p.previousReadingUnits,
            current: p.currentReadingUnits,
            units: p.unitsConsumed,
            ratePerUnitPaise: p.ratePerUnitPaise,
          },
          historicalResidents: p.historicalResidents,
          existingInvoiceCount: p.existingInvoices.length,
          planKind: p.plan.kind,
          proposedCreates: p.plan.create.map((c) => ({
            customerId: c.customerId,
            customerName: c.customerName,
            amountPaise: c.amountPaise,
            activeDays: c.activeDays,
          })),
          mismatchReasons: p.plan.mismatchReasons,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
