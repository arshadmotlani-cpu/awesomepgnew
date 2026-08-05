#!/usr/bin/env npx tsx
/**
 * Migrate fyh_admin_users + fyh_staff → Workforce Engine (wf_*).
 * Usage: npx tsx scripts/hair/migrate-to-workforce.ts [--apply]
 * Default is dry-run.
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { closeHairDb } from '@/src/hair/db/client';
import { migrateHairToWorkforce } from '@/src/workforce/migrate/migrateHairToWorkforce';

async function main() {
  const apply = process.argv.includes('--apply');
  const result = await migrateHairToWorkforce({ dryRun: !apply });
  console.log(JSON.stringify(result, null, 2));
  if (!apply) {
    console.log('\nDry-run only. Pass --apply to write.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeHairDb());
