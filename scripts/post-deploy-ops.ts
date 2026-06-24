#!/usr/bin/env npx tsx
/**
 * Post-deploy production ops: trigger crons and optionally run DB scripts.
 *
 * Usage:
 *   CRON_SECRET=… npx tsx scripts/post-deploy-ops.ts
 *   CRON_SECRET=… npx tsx scripts/post-deploy-ops.ts --with-db
 *   CRON_SECRET=… npx tsx scripts/post-deploy-ops.ts --local   # hit local dev server
 */
import dotenv from 'dotenv';
import { CANONICAL_PRODUCTION_URL, getAppUrl } from '../src/lib/url';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.bak' });
dotenv.config();

const baseUrl = (
  process.argv.includes('--local') ? getAppUrl() : CANONICAL_PRODUCTION_URL
).replace(/\/$/, '');

const cronSecret = process.env.CRON_SECRET?.trim();

async function hitCron(path: string): Promise<void> {
  if (!cronSecret) {
    console.error('CRON_SECRET not set — skip remote cron', path);
    return;
  }
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const body = await res.text();
  console.log(`\n[${path}] HTTP ${res.status}`);
  try {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  } catch {
    console.log(body.slice(0, 400));
  }
}

async function runDbScripts(): Promise<void> {
  const { hasDatabaseUrl } = await import('../src/lib/db/env');
  if (!hasDatabaseUrl()) {
    console.error(
      'DATABASE_URL not available locally (Neon/Vercel integration secrets are empty in env pull).',
    );
    console.error('Run on Vercel shell or paste DATABASE_URL from Neon dashboard:');
    console.error('  npx tsx scripts/expire-fixed-stays-now.ts');
    console.error('  npx tsx scripts/audit-financials.ts');
    console.error('  npx tsx scripts/repair-financials.ts --dry-run');
    return;
  }

  const { processFixedStayAutoExpiryBatch } = await import(
    '../src/services/fixedStayAutoExpiry'
  );
  const { runFinancialIntegrityAudit } = await import(
    '../src/services/financialIntegrityAudit'
  );
  const { repairFinancialIssues } = await import('../src/services/financialRepair');

  console.log('\n=== DB: fixed-stay expiry ===');
  console.log(JSON.stringify(await processFixedStayAutoExpiryBatch(), null, 2));

  console.log('\n=== DB: financial audit ===');
  const audit = await runFinancialIntegrityAudit();
  console.log(
    `Issues: ${audit.summary.issueCount} across ${audit.summary.customersWithIssues} customers`,
  );

  console.log('\n=== DB: financial repair (dry-run) ===');
  const repair = await repairFinancialIssues({ dryRun: true });
  console.log(`Would repair: ${repair.repairedCount}, manual: ${repair.manualReviewCount}`);
}

async function main() {
  console.log(`Target: ${baseUrl}`);

  await hitCron('/api/cron/expire-fixed-stays');
  await hitCron('/api/cron/financial-reconciliation');

  if (process.argv.includes('--with-db')) {
    await runDbScripts();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
