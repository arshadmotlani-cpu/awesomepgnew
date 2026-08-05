/**
 * Dry-run by default:
 *   npx tsx --tsconfig tsconfig.json scripts/cleanup-payment-review-synthetics.ts
 * Execute:
 *   npx tsx --tsconfig tsconfig.json scripts/cleanup-payment-review-synthetics.ts --execute
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('cleanup-payment-review-synthetics');

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb } from '@/src/db/client';
import {
  cleanupSyntheticPaymentReviews,
  previewSyntheticPaymentReviewPollution,
} from '@/src/lib/health/syntheticPollutionCleanup';

async function main() {
  const execute = process.argv.includes('--execute');
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });

  const preview = await previewSyntheticPaymentReviewPollution(500);
  console.log(
    JSON.stringify(
      {
        mode: execute ? 'execute' : 'dry-run',
        rentCandidates: preview.rent.length,
        electricityCandidates: preview.electricity.length,
        sampleRent: preview.rent.slice(0, 10),
        sampleElec: preview.electricity.slice(0, 10),
      },
      null,
      2,
    ),
  );

  const result = await cleanupSyntheticPaymentReviews({
    limit: 500,
    dryRun: !execute,
  });

  const out = {
    measuredAt: new Date().toISOString(),
    execute,
    result,
  };
  writeFileSync(
    join(process.cwd(), 'tmp/synthetic-cleanup-wave2.json'),
    JSON.stringify(out, null, 2),
  );
  console.log('Wrote tmp/synthetic-cleanup-wave2.json');
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
