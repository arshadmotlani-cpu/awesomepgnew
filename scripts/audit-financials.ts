/**
 * Scan all customers for financial integrity issues (8 checks).
 * Usage: npx tsx scripts/audit-financials.ts
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { runFinancialIntegrityAudit } from '../src/services/financialIntegrityAudit';

async function main() {
  console.log('Running full financial integrity audit…');
  const report = await runFinancialIntegrityAudit();

  console.log('\n=== Financial Audit Summary ===');
  console.log(`As of: ${report.asOf}`);
  console.log(`Customers scanned: ${report.summary.totalCustomers}`);
  console.log(`Customers with issues: ${report.summary.customersWithIssues}`);
  console.log(`Total issues: ${report.summary.issueCount}`);
  console.log('\nBy check type:');
  for (const [type, count] of Object.entries(report.summary.byCheckType)) {
    if (count > 0) console.log(`  ${type}: ${count}`);
  }

  if (report.issues.length > 0) {
    console.log('\nSample issues (first 20):');
    for (const issue of report.issues.slice(0, 20)) {
      console.log(`  [${issue.checkType}] ${issue.customerName}: ${issue.detail}`);
    }
  }

  const timestamp = report.asOf.replace(/[:.]/g, '-');
  const outPath = `audit-output-${timestamp}.json`;
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
