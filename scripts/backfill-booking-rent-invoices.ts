/**
 * Backfill paid rent invoices for historical booking/extension payments.
 *
 *   npx tsx scripts/backfill-booking-rent-invoices.ts           # dry-run
 *   npx tsx scripts/backfill-booking-rent-invoices.ts --execute # apply
 */
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '../src/db/client';
import {
  discoverBookingRentInvoiceGaps,
  ensureBookingRentInvoiceForExistingPayment,
} from '../src/services/bookingPaymentInvoices';
import { paiseToInr } from '../src/lib/format';

for (const file of ['.env.production.local', '.env.prod', '.env.local', '.env']) {
  const path = join(process.cwd(), file);
  if (existsSync(path)) config({ path, override: true });
}

const execute = process.argv.includes('--execute');

async function main() {
  const { close } = createClient();
  const report = await discoverBookingRentInvoiceGaps();
  const paymentIds = [
    ...report.bookingGaps.filter((r) => !r.isTest).map((r) => r.paymentId),
    ...report.extensionGaps.map((r) => r.paymentId),
  ];

  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}`);
  console.log(`Payments to process: ${paymentIds.length}`);
  console.log(
    `Estimated revenue to close: ${paiseToInr(report.summary.totalEstimatedMissingRevenuePaise)}`,
  );

  let ok = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const paymentId of paymentIds) {
    if (!execute) {
      console.log(`  [dry-run] would backfill payment ${paymentId}`);
      ok += 1;
      continue;
    }

    const result = await ensureBookingRentInvoiceForExistingPayment(paymentId);
    if ('skipped' in result && result.skipped) {
      console.log(`  skip ${paymentId}: ${result.reason}`);
      continue;
    }
    if (result.ok) {
      ok += 1;
      console.log(`  ✓ ${paymentId} → invoice ${result.invoiceId}`);
    } else {
      failed += 1;
      errors.push(`${paymentId}: ${result.reason}`);
      console.error(`  ✗ ${paymentId}: ${result.reason}`);
    }
  }

  console.log(`Done. ok=${ok} failed=${failed}`);
  if (errors.length > 0) {
    console.log('Errors:', errors.slice(0, 10).join('\n'));
  }

  await close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
