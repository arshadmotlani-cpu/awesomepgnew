/**
 * Auto-repair financial integrity issues after running audit.
 * Usage:
 *   npx tsx scripts/repair-financials.ts --dry-run
 *   npx tsx scripts/repair-financials.ts
 */
import 'dotenv/config';
import { repairFinancialIssues } from '../src/services/financialRepair';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? 'DRY RUN — no DB writes' : 'LIVE RUN — applying repairs');

  const result = await repairFinancialIssues({ dryRun });

  console.log('\n=== Before ===');
  console.log(`Issues: ${result.before.summary.issueCount}`);
  for (const [type, count] of Object.entries(result.before.summary.byCheckType)) {
    if (count > 0) console.log(`  ${type}: ${count}`);
  }

  console.log('\n=== Actions ===');
  for (const action of result.actions) {
    console.log(`  [${action.action}] ${action.checkType}: ${action.detail}`);
  }

  if (result.after) {
    console.log('\n=== After ===');
    console.log(`Issues: ${result.after.summary.issueCount}`);
    for (const [type, count] of Object.entries(result.after.summary.byCheckType)) {
      if (count > 0) console.log(`  ${type}: ${count}`);
    }
  }

  console.log(`\nRepaired: ${result.repairedCount}, Manual review: ${result.manualReviewCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
