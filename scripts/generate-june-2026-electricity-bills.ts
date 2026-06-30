/* eslint-disable no-console */
/**
 * Generate June 2026 electricity bills — CLI wrapper.
 *
 *   npx tsx scripts/generate-june-2026-electricity-bills.ts
 *   npx tsx scripts/generate-june-2026-electricity-bills.ts --dry-run
 */
import 'dotenv/config';

import { closeDb } from '../src/db/client';
import { runGenerateJune2026ElectricityBills } from '../src/services/generateJune2026ElectricityBills';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const pgIdx = args.indexOf('--pg');
  const pgQuery = pgIdx >= 0 ? (args[pgIdx + 1] ?? 'shanti') : 'shanti';

  await runGenerateJune2026ElectricityBills({
    dryRun,
    pgQuery,
    onLog: (line) => console.log(line),
  });
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('\n✗ BATCH STOPPED:', err instanceof Error ? err.message : err);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
