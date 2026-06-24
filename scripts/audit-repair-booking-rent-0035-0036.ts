#!/usr/bin/env npx tsx
/**
 * Audit + idempotent repair for APG-2026-0035 and APG-2026-0036 booking rent invoices.
 *
 *   npx tsx scripts/audit-repair-booking-rent-0035-0036.ts           # audit only
 *   npx tsx scripts/audit-repair-booking-rent-0035-0036.ts --execute # repair + re-audit
 *
 * Vercel build: REPAIR_BOOKING_RENT_0035_0036=1
 * Production cron: POST /api/cron/repair-booking-rent-invoices?execute=1
 */
import { createClient } from '../src/db/client';
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';
import { paiseToInr } from '../src/lib/format';
import {
  DEFAULT_BOOKING_RENT_REPAIR_CODES,
  runBookingRentInvoiceAuditRepair,
} from '../src/services/bookingRentInvoiceRepair';

loadScriptEnv();

async function main() {
  const execute = process.argv.includes('--execute');
  const { close } = createClient();

  try {
    console.log('═'.repeat(72));
    console.log(`BOOKING RENT INVOICE AUDIT — ${DEFAULT_BOOKING_RENT_REPAIR_CODES.join(', ')}`);
    console.log(`Mode: ${execute ? 'EXECUTE (repair + re-audit)' : 'AUDIT ONLY'}`);
    console.log('═'.repeat(72));

    const report = await runBookingRentInvoiceAuditRepair({
      bookingCodes: [...DEFAULT_BOOKING_RENT_REPAIR_CODES],
      execute,
    });

    console.log('\n--- REVENUE BEFORE ---');
    console.log(JSON.stringify(report.revenueBefore, null, 2));
    console.log('\n--- AUDIT BEFORE ---');
    console.log(JSON.stringify(report.auditBefore, null, 2));

    if (execute) {
      console.log('\n--- REPAIR ---');
      console.log(JSON.stringify(report.repairResults, null, 2));
    }

    console.log('\n--- REVENUE AFTER ---');
    console.log(JSON.stringify(report.revenueAfter, null, 2));

    console.log('\n--- PASS / FAIL MATRIX ---');
    for (const row of report.matrix) {
      console.log(`${row.bookingCode}: ${row.overallPass ? 'PASS' : 'FAIL'}`);
      console.log(`  Rent invoice:      ${row.rentInvoiceId ?? 'MISSING'}`);
      console.log(`  Financial invoice: ${row.financialInvoiceId ?? 'MISSING'}`);
      console.log(`  Revenue impact:    ${paiseToInr(row.revenueImpactPaise)}`);
      for (const [k, v] of Object.entries(row)) {
        if (k.startsWith('q')) console.log(`  ${v ? 'PASS' : 'FAIL'} ${k}`);
      }
    }

    console.log('\n--- SUMMARY JSON ---');
    console.log(JSON.stringify(report, null, 2));

    if (execute && !report.overallPass) process.exit(1);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
