/* eslint-disable no-console */
/**
 * One-time backfill: set profile_completed_at where fields are already complete.
 */
import 'dotenv/config';
import { backfillProfileCompletedStamps } from '../src/services/profile';
import { closeDb } from '../src/db/client';

async function main() {
  const result = await backfillProfileCompletedStamps();
  console.log(`Scanned ${result.scanned} customers, stamped ${result.stamped}.`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
