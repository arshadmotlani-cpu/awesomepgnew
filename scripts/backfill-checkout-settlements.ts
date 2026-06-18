/* eslint-disable no-console */
/**
 * One-time backfill: checkout_settlements for approved/completed vacating
 * requests that pre-date the unified checkout settlement system.
 *
 * Usage:
 *   npx tsx scripts/backfill-checkout-settlements.ts
 *   npx tsx scripts/backfill-checkout-settlements.ts --dry-run
 *
 * Does NOT touch deposit ledger or occupancy.
 */
import 'dotenv/config';
import { backfillCheckoutSettlementsFromVacating } from '@/src/services/checkoutSettlement';
import { closeDb } from '@/src/db/client';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    console.log('DRY RUN — no rows will be inserted.\n');
  }

  const result = await backfillCheckoutSettlementsFromVacating({ dryRun });

  console.log(`Scanned ${result.scanned} vacating request(s) missing checkout settlements.`);
  console.log(`Created ${result.created.length} settlement(s).\n`);

  if (result.created.length === 0) {
    console.log('Nothing to backfill.');
  } else {
    console.table(
      result.created.map((row) => ({
        settlementId: row.settlementId,
        resident: row.customerName,
        vacatingDate: row.vacatingDate,
        status: row.status,
        noticeDeductionPaise: row.noticeDeductionPaise,
        hadDeductionSnapshot: row.hadDeductionSnapshot,
        vacatingRequestId: row.vacatingRequestId,
        bookingId: row.bookingId,
      })),
    );
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
