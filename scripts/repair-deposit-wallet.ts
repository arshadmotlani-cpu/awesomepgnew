/* eslint-disable no-console */
/**
 * Audit (default) or sync one booking's deposit wallet from ledger.
 *
 * Usage:
 *   npx tsx scripts/repair-deposit-wallet.ts <bookingId>
 *   npx tsx scripts/repair-deposit-wallet.ts <bookingId> --execute
 */
import 'dotenv/config';
import { closeDb } from '../src/db/client';
import { repairDepositWallet } from '../src/services/depositWalletRepair';

const bookingId = process.argv[2];
const execute = process.argv.includes('--execute');

if (!bookingId) {
  console.error('Usage: npx tsx scripts/repair-deposit-wallet.ts <bookingId> [--execute]');
  process.exit(1);
}

async function main() {
  const result = await repairDepositWallet(bookingId, { execute });
  console.log(JSON.stringify(result, null, 2));
  if (result.report.issues.length > 0) {
    console.error('\nIssues found:');
    for (const issue of result.report.issues) {
      console.error(`  - ${issue}`);
    }
  }
  if (execute && result.syncError) {
    process.exit(1);
  }
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
