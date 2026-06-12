/**
 * One-off operator cleanup: cancel test bookings and remove test deposit
 * deductions that inflate Overview "Extra income".
 *
 *   npx tsx scripts/cleanup-operator-test-data.ts           # dry run
 *   npx tsx scripts/cleanup-operator-test-data.ts --execute
 *
 * For production (Neon), use Admin → Settings → "Remove test data from overview"
 * after deploy, or pass DATABASE_URL explicitly:
 *   DATABASE_URL='postgres://…' npx tsx scripts/cleanup-operator-test-data.ts --execute
 */
import 'dotenv/config';
import { closeDb } from '../src/db/client';
import {
  previewOperatorTestDataCleanup,
  runOperatorTestDataCleanup,
} from '../src/services/operatorTestDataCleanup';

const EXECUTE = process.argv.includes('--execute');

async function main() {
  console.log(EXECUTE ? '=== EXECUTE MODE ===' : '=== DRY RUN (pass --execute to apply) ===');

  const preview = await previewOperatorTestDataCleanup();

  if (!preview.operator) {
    console.error('Operator customer not found.');
    process.exit(1);
  }

  console.log(`\nOperator bookings (${preview.operator.fullName}):`);
  for (const b of preview.operatorBookings) {
    console.log(`  ${b.bookingCode} [${b.status}]`);
  }

  console.log(
    `\nTest deposit deductions to remove (June 2026): ${preview.testDeductions.length} rows, ₹${preview.removedDeductionPaise / 100}`,
  );
  for (const row of preview.testDeductions) {
    console.log(
      `  - ${row.bookingCode} (${row.email}): ₹${Math.abs(row.amountPaise) / 100} — ${row.reason.slice(0, 60)}`,
    );
  }

  if (!EXECUTE) {
    console.log('\nWould cancel operator bookings:', preview.activeBookingIds.length);
    console.log('Re-run with --execute to apply.');
    return;
  }

  const result = await runOperatorTestDataCleanup();
  console.log('\nDone.');
  console.log(`Cancelled ${result.cancelledBookingIds.length} operator booking(s) and freed beds.`);
  console.log(
    `Removed ${result.removedDeductionIds.length} test deposit deduction(s) (₹${result.removedDeductionPaise / 100}).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closeDb());
