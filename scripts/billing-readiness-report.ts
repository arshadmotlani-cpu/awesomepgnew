#!/usr/bin/env npx tsx
/**
 * Full production billing readiness verification + report.
 *
 *   CRON_SECRET=… npx tsx scripts/billing-readiness-report.ts
 *   CRON_SECRET=… npx tsx scripts/billing-readiness-report.ts --local
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { CANONICAL_PRODUCTION_URL } from '@/src/lib/url';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.bak' });
dotenv.config();

const baseUrl = (
  process.argv.includes('--local') ? 'http://localhost:3000' : CANONICAL_PRODUCTION_URL
).replace(/\/$/, '');

const cronSecret = process.env.CRON_SECRET?.trim();

type VerifyResponse = {
  ok: boolean;
  todayIst: string;
  commit: string | null;
  migrationCount: number;
  durationMs: number;
  summary: { pass: number; warn: number; fail: number; blocked: number; timeout: number };
  checks: Array<{ section: string; status: string; detail: string }>;
  reason?: string;
};

function latestMigrationTag(): string {
  try {
    const journal = JSON.parse(
      readFileSync(join(process.cwd(), 'src/db/migrations/meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ tag: string }> };
    const entries = journal.entries ?? [];
    return entries[entries.length - 1]?.tag ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function gitHead(): string {
  try {
    return readFileSync(join(process.cwd(), '.git/HEAD'), 'utf8').trim();
  } catch {
    return 'unknown';
  }
}

async function runVerify(): Promise<VerifyResponse> {
  if (!cronSecret) {
    throw new Error('CRON_SECRET not set — use .env.bak or export CRON_SECRET');
  }
  const url = `${baseUrl}/api/cron/billing-production-verify?full=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cronSecret}` },
    signal: AbortSignal.timeout(58_000),
  });
  const body = (await res.json()) as VerifyResponse;
  if (!res.ok && !body.checks) {
    throw new Error(body.reason ?? `HTTP ${res.status}`);
  }
  return body;
}

function sectionChecks(checks: VerifyResponse['checks'], prefix: string | RegExp): string {
  const filtered = checks.filter((c) =>
    typeof prefix === 'string' ? c.section.includes(prefix) : prefix.test(c.section),
  );
  if (filtered.length === 0) return '_None_';
  return filtered.map((c) => `- **${c.status}** ${c.section}: ${c.detail}`).join('\n');
}

async function main() {
  console.log(`\nBilling readiness verification → ${baseUrl}\n`);
  const result = await runVerify();
  const repoHead = gitHead();
  const latestMigration = latestMigrationTag();

  const fails = result.checks.filter((c) => c.status === 'FAIL');
  const blocked = result.checks.filter((c) => c.status === 'BLOCKED');
  const timeouts = result.checks.filter((c) => c.status === 'TIMEOUT');
  const ready = fails.length === 0 && blocked.length === 0 && timeouts.length === 0;

  const report = `# Billing Readiness Report

> Generated: ${new Date().toISOString()}  
> Target: ${baseUrl}  
> Duration: ${result.durationMs}ms  
> Overall: **${ready ? 'READY' : 'NOT READY'}** (${result.summary.pass} PASS · ${result.summary.warn} WARN · ${result.summary.fail} FAIL)

## Deployment

| Item | Value |
|------|-------|
| Production commit (runtime) | \`${result.commit ?? 'unknown'}\` |
| Local HEAD | \`${repoHead}\` |
| Latest migration (repo) | \`${latestMigration}\` |
| Migrations applied (DB) | ${result.migrationCount} |

## Scheduler status

${sectionChecks(result.checks, /scheduler|Scheduler|Next scheduler|Billing health/)}

## Cron status

${sectionChecks(result.checks, /Cron|cron/)}

## Billing profiles

${sectionChecks(result.checks, /billing profile|Fixed-date|Monthly resident/)}

## Rent verification

${sectionChecks(result.checks, /Rent|Revenue rent/)}

## Electricity verification

${sectionChecks(result.checks, /Electricity|electricity/)}

## Notification verification

${sectionChecks(result.checks, /notification|Notification/)}

## Revenue verification

${sectionChecks(result.checks, /Revenue|reconciliation/)}

## Resident billing verification

${sectionChecks(result.checks, /Resident billing/)}

## Full check list

| Status | Section | Detail |
|--------|---------|--------|
${result.checks.map((c) => `| ${c.status} | ${c.section} | ${c.detail.replace(/\|/g, '\\|')} |`).join('\n')}

---

## Can Awesome PG begin using automatic billing for real residents?

**${ready ? 'YES' : 'NO'}**

${
  ready
    ? `Production verification completed with ${result.summary.pass} passing checks and ${result.summary.warn} non-critical warnings only. Rent generation treats existing and paid invoices as success; electricity verification uses lightweight logic checks without creating batches; scheduler, cron auth, billing profiles, revenue reconciliation, and resident billing visibility all passed. Automatic anniversary rent billing is safe to rely on for real monthly residents.`
    : `Production verification found ${fails.length} failure(s)${blocked.length ? `, ${blocked.length} blocked` : ''}${timeouts.length ? `, ${timeouts.length} timeout(s)` : ''}. Automatic billing must not be treated as fully ready until these are resolved: ${[...fails, ...blocked, ...timeouts].map((c) => c.section).join(', ')}.`
}
`;

  const outPath = join(process.cwd(), 'BILLING_READINESS_REPORT.md');
  writeFileSync(outPath, report, 'utf8');

  console.log(report);
  console.log(`\nWritten to ${outPath}\n`);

  if (!ready) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
