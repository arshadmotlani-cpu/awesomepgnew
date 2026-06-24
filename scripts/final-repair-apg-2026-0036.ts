/**
 * One-time repair: APG-2026-0036
 *
 *   npx tsx scripts/final-repair-apg-2026-0036.ts --execute
 */
import 'dotenv/config';
import { createClient } from '../src/db/client';
import { repairApg20260036 } from '../src/services/repairApg20260036';

async function main() {
  const execute = process.argv.includes('--execute');
  if (!execute) {
    console.log('Pass --execute to run APG-2026-0036 repair.');
    return;
  }

  const { close } = createClient();
  try {
    const result = await repairApg20260036();
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
