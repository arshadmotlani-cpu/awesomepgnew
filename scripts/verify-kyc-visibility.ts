/* eslint-disable no-console */
/**
 * P0 KYC visibility verification — production audit.
 *
 *   npx tsx scripts/verify-kyc-visibility.ts
 *   npx tsx scripts/verify-kyc-visibility.ts --sync
 *   VERIFY_KYC_VISIBILITY=1  # Vercel build (scripts/vercel-build-repair.sh)
 */
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';

loadScriptEnv();

async function main() {
  const syncFirst = process.argv.includes('--sync');
  const { runKycVisibilityAudit } = await import('../src/services/kycVisibilityAudit');
  const { closeDb } = await import('../src/db/client');

  console.log('\n=== P0 KYC Visibility Audit ===\n');
  const report = await runKycVisibilityAudit({ syncFirst });

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nOVERALL: ${report.overall}`);
  console.log(
    `KYC review items: ${report.summary.kycReviewPass}/${report.summary.kycReviewRequired} pass`,
  );
  console.log(
    `Legacy profile false positives (kyc_status=pending, no submission): ${report.summary.legacyFalsePositives}`,
  );

  if (report.dhairya.found) {
    console.log('\n--- Dhairya Zinzuvadiya ---');
    console.log('customerId:', report.dhairya.customerId);
    console.log('profileStateLine:', report.dhairya.profileStateLine);
    console.log('kyc_submissions:', report.dhairya.kycSubmissions);
    console.log('surfaces:', report.dhairya.surfaces);
  } else {
    console.log('\nDhairya Zinzuvadiya: NOT FOUND in DB');
  }

  const fails = report.actionAudits.filter((a) => !a.pass);
  if (fails.length > 0) {
    console.log(`\n${fails.length} action surface gap(s):`);
    for (const f of fails.slice(0, 20)) {
      console.log(`  ${f.customerName} [${f.kind}] gaps=${f.gaps.join(',')}`);
    }
  }

  await closeDb();

  if (report.overall === 'FAIL') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
