/**
 * Read-only discovery — checkout payments with prorated first invoice and no advance credit.
 *
 * Run:
 *   npx tsx scripts/discover-checkout-rent-proration-gaps.ts
 *   npx tsx scripts/discover-checkout-rent-proration-gaps.ts --code APG-2026-0045
 */
import { createClient } from '@/src/db/client';
import { paiseToInr } from '@/src/lib/format';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import {
  ANNIVERSARY_BILLING_DEPLOY_UTC,
  discoverCheckoutRentProrationGaps,
} from '@/src/services/checkoutRentAccounting';

loadProductionAuditEnv();
requireDatabaseUrl();

function parseCodeArg(): string | undefined {
  const eqArg = process.argv.find((a) => a.startsWith('--code='));
  if (eqArg) return eqArg.split('=')[1];
  const idx = process.argv.indexOf('--code');
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

async function main() {
  const { close } = createClient();
  const bookingCode = parseCodeArg();

  try {
    const rows = await discoverCheckoutRentProrationGaps({ bookingCode });
    const totalDiff = rows.reduce((a, r) => a + r.differencePaise, 0);
    const totalOutstanding = rows.reduce((a, r) => a + r.outstandingRentPaise, 0);

    console.log('═'.repeat(88));
    console.log('CHECKOUT RENT PRORATION GAP DISCOVERY');
    console.log('═'.repeat(88));
    console.log(`Anniversary billing deploy (UTC): ${ANNIVERSARY_BILLING_DEPLOY_UTC}`);
    console.log(`Filter: ${bookingCode ?? 'all production bookings'}`);
    console.log('');
    console.log(`Affected bookings:     ${rows.length}`);
    console.log(`Total trapped rent:    ${paiseToInr(totalDiff)} (${totalDiff} paise)`);
    console.log(`Total outstanding:     ${paiseToInr(totalOutstanding)} (${totalOutstanding} paise)`);
    console.log(
      `Pre-anniversary:       ${rows.filter((r) => !r.anniversaryDeployed).length}`,
    );
    console.log(
      `Post-anniversary:      ${rows.filter((r) => r.anniversaryDeployed).length}`,
    );
    console.log('');

    if (rows.length === 0) {
      console.log('No gaps found.');
    } else {
      console.log(
        'Booking'.padEnd(16) +
          'Resident'.padEnd(22) +
          'Monthly'.padEnd(12) +
          'Collected'.padEnd(12) +
          'Invoice'.padEnd(12) +
          'Paid'.padEnd(12) +
          'Diff'.padEnd(10) +
          'Outstanding'.padEnd(12) +
          'PaidOn'.padEnd(12) +
          'Anniv?',
      );
      for (const r of rows) {
        console.log(
          r.bookingCode.padEnd(16) +
            r.resident.slice(0, 20).padEnd(22) +
            paiseToInr(r.monthlyRentPaise).padEnd(12) +
            paiseToInr(r.rentCollectedPaise).padEnd(12) +
            paiseToInr(r.invoiceRentPaise).padEnd(12) +
            paiseToInr(r.invoicePaidPaise).padEnd(12) +
            paiseToInr(r.differencePaise).padEnd(10) +
            paiseToInr(r.outstandingRentPaise).padEnd(12) +
            r.paymentDate.padEnd(12) +
            (r.anniversaryDeployed ? 'yes' : 'no'),
        );
        console.log(`  ${r.invoiceNumber} — ${r.invoiceNotes ?? '(no notes)'}`);
      }
    }

    console.log('═'.repeat(88));
    process.exit(rows.length > 0 ? 2 : 0);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
