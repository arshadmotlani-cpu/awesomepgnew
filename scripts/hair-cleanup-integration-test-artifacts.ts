/* eslint-disable no-console */
/**
 * Audit and optionally delete Hair integration-test artifacts from the live database.
 *
 * Dry run (default):
 *   npx tsx scripts/hair-cleanup-integration-test-artifacts.ts
 *
 * Execute deletes (production requires explicit confirmation):
 *   CONFIRM_HAIR_TEST_CLEANUP=1 npx tsx scripts/hair-cleanup-integration-test-artifacts.ts --execute
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
import {
  PRODUCTION_HAIR_HOST_FRAGMENT,
  requireProductionCutoverWriteEnv,
} from '@/src/lib/db/loadProductionCutoverEnv';
import { createHairClient } from '@/src/hair/db/client';
import { cleanupHairIntegrationTestArtifacts } from '@/src/hair/services/testArtifactCleanup';

loadAppEnv();

const execute = process.argv.includes('--execute');

function resolveHairHost(): string {
  const url = process.env.HAIR_DATABASE_URL ?? '';
  try {
    return new URL(url.replace(/^postgres:/, 'postgresql:')).hostname;
  } catch {
    return url;
  }
}

async function main() {
  const host = resolveHairHost();
  console.log(`Hair database host: ${host || '(unknown)'}`);
  if (host.includes(PRODUCTION_HAIR_HOST_FRAGMENT)) {
    console.log('Production Hair database detected.');
    if (execute) {
      requireProductionCutoverWriteEnv();
      if (process.env.CONFIRM_HAIR_TEST_CLEANUP !== '1') {
        throw new Error('Set CONFIRM_HAIR_TEST_CLEANUP=1 to delete test artifacts on production Hair.');
      }
    }
  } else if (execute && process.env.CONFIRM_HAIR_TEST_CLEANUP !== '1') {
    throw new Error('Set CONFIRM_HAIR_TEST_CLEANUP=1 to execute deletes.');
  }

  const { db, close } = createHairClient({ max: 1 });
  try {
    const result = await cleanupHairIntegrationTestArtifacts(db, { dryRun: !execute });
    console.log('\n=== Audit (before) ===');
    for (const row of result.auditBefore) {
      console.log(`  ${row.label}: ${row.count}`);
    }
    if (execute) {
      console.log('\n=== Deleted ===');
      for (const row of result.deleted) {
        if (row.count > 0) console.log(`  ${row.label}: ${row.count}`);
      }
      console.log('\n=== Audit (after) ===');
      for (const row of result.auditAfter) {
        console.log(`  ${row.label}: ${row.count}`);
      }
    } else {
      console.log('\nDry run only — pass --execute with CONFIRM_HAIR_TEST_CLEANUP=1 to delete.');
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
