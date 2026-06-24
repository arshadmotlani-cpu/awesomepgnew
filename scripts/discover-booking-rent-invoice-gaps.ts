/**
 * Discovery report — booking/extension payments without paid rent invoice link.
 *
 * Run:
 *   npx tsx scripts/discover-booking-rent-invoice-gaps.ts
 *   DISCOVER_BOOKING_RENT_GAPS=1 on Vercel build
 */
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '../src/db/client';
import { discoverBookingRentInvoiceGaps } from '../src/services/bookingPaymentInvoices';
import { paiseToInr } from '../src/lib/format';

for (const file of [
  '.env.production.local',
  '.env.prod',
  '.env.local',
  '.env',
  '.env.repair.local',
  '.env.vercel.prod.live',
]) {
  const path = join(process.cwd(), file);
  if (existsSync(path)) config({ path, override: false });
}
if (existsSync(join(process.cwd(), '.env.vercel.pull.tmp'))) {
  config({ path: join(process.cwd(), '.env.vercel.pull.tmp'), override: true });
}

async function main() {
  const { close } = createClient();
  try {
    const report = await discoverBookingRentInvoiceGaps();
    const { summary } = report;

    console.log('═'.repeat(72));
    console.log('BOOKING RENT INVOICE GAP DISCOVERY');
    console.log('═'.repeat(72));
    console.log(`Generated: ${report.generatedAt}`);
    console.log('');
    console.log('SUMMARY (production customers only for booking gaps)');
    console.log(`  Affected bookings:              ${summary.affectedBookingCount}`);
    console.log(`  Affected booking payments:      ${summary.affectedBookingPaymentCount}`);
    console.log(`  Affected extension payments:    ${summary.affectedExtensionPaymentCount}`);
    console.log(
      `  Missing booking rent (est.):    ${paiseToInr(summary.estimatedMissingRentPaise)} (${summary.estimatedMissingRentPaise} paise)`,
    );
    console.log(
      `  Missing extension rent (est.):  ${paiseToInr(summary.estimatedMissingExtensionRentPaise)} (${summary.estimatedMissingExtensionRentPaise} paise)`,
    );
    console.log(
      `  TOTAL missing revenue (est.):   ${paiseToInr(summary.totalEstimatedMissingRevenuePaise)} (${summary.totalEstimatedMissingRevenuePaise} paise)`,
    );
    console.log('');

    const prodBookingGaps = report.bookingGaps.filter((r) => !r.isTest);
    if (prodBookingGaps.length > 0) {
      console.log('BOOKING PAYMENT GAPS (first 25)');
      for (const row of prodBookingGaps.slice(0, 25)) {
        console.log(
          `  ${row.bookingCode} | ${row.durationMode} | rent ${paiseToInr(row.estimatedRentPaise)} | payment ${row.paymentId.slice(0, 8)}…`,
        );
      }
      if (prodBookingGaps.length > 25) {
        console.log(`  … and ${prodBookingGaps.length - 25} more`);
      }
      console.log('');
    }

    if (report.extensionGaps.length > 0) {
      console.log('EXTENSION PAYMENT GAPS (first 25)');
      for (const row of report.extensionGaps.slice(0, 25)) {
        console.log(
          `  ${row.bookingCode} | ext ${row.extensionId.slice(0, 8)}… | ${paiseToInr(row.paymentAmountPaise)} | payment ${row.paymentId.slice(0, 8)}…`,
        );
      }
      if (report.extensionGaps.length > 25) {
        console.log(`  … and ${report.extensionGaps.length - 25} more`);
      }
      console.log('');
    }

    console.log('MIGRATION PLAN');
    console.log('  1. Deploy invoice-first webhook hooks (recordPaymentSuccess / extension).');
    console.log('  2. Run backfill dry-run: npx tsx scripts/backfill-booking-rent-invoices.ts');
    console.log('  3. Execute backfill:     npx tsx scripts/backfill-booking-rent-invoices.ts --execute');
    console.log('  4. Re-run this discovery script — expect zero production booking gaps.');
    console.log('  5. Verify APG-2026-0036 rent invoice + financial_invoices row exists.');
    console.log('═'.repeat(72));

    process.exit(summary.affectedBookingPaymentCount + summary.affectedExtensionPaymentCount > 0 ? 2 : 0);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
