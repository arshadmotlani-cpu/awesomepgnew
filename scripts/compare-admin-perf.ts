/**
 * Compare two admin-perf JSON artifacts (before vs after).
 *
 *   npx tsx scripts/compare-admin-perf.ts test-results/admin-perf-before.json test-results/admin-perf-after.json
 */

import { readFileSync, writeFileSync } from 'node:fs';

type PageResult = {
  page: string;
  scenario: string;
  layoutMs: number;
  pageMs: number;
  totalMs: number;
  db: {
    queryCount: number;
    totalDbMs: number;
    duplicateQueryCount: number;
    uniqueFingerprints: number;
  };
  queueBuilds: number;
  paymentReviewFetches: number;
};

type ProfileReport = {
  label: string;
  runAt: string;
  pages: PageResult[];
  cacheVerification: Record<string, number>;
};

function pageKey(p: PageResult): string {
  return `${p.page}::${p.scenario}`;
}

function pctDelta(before: number, after: number): string {
  if (before === 0) return after === 0 ? '0%' : 'n/a';
  const pct = Math.round(((after - before) / before) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function loadReport(path: string): ProfileReport {
  return JSON.parse(readFileSync(path, 'utf8')) as ProfileReport;
}

function main() {
  const beforePath = process.argv[2];
  const afterPath = process.argv[3];
  const outPath = process.argv[4] ?? 'docs/ADMIN_PERFORMANCE_REPORT.md';

  if (!beforePath || !afterPath) {
    console.error('Usage: compare-admin-perf.ts <before.json> <after.json> [out.md]');
    process.exit(1);
  }

  const before = loadReport(beforePath);
  const after = loadReport(afterPath);

  const beforeMap = new Map(before.pages.map((p) => [pageKey(p), p]));
  const afterMap = new Map(after.pages.map((p) => [pageKey(p), p]));

  const allKeys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();

  const lines: string[] = [
    '# Admin Performance Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `- **Before:** \`${beforePath}\` (${before.runAt}, label=${before.label})`,
    `- **After:** \`${afterPath}\` (${after.runAt}, label=${after.label})`,
    '',
    'Timings are **loader-equivalent SSR** (direct service calls). Full Next.js RSC render adds ~50–100ms UI overhead not captured here.',
    '',
    '## Per-page timings',
    '',
    '| Page | Scenario | Before SSR (ms) | After SSR (ms) | Delta | Before DB (ms) | After DB (ms) | Delta |',
    '|------|----------|-----------------|----------------|-------|----------------|---------------|-------|',
  ];

  const regressions: string[] = [];
  let totalBefore = 0;
  let totalAfter = 0;

  for (const key of allKeys) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);
    if (!b || !a) continue;
    totalBefore += b.totalMs;
    totalAfter += a.totalMs;
    if (a.totalMs > b.totalMs * 1.1) {
      regressions.push(`${b.page} (${b.scenario}): ${b.totalMs}ms → ${a.totalMs}ms`);
    }
    lines.push(
      `| ${b.page} | ${b.scenario} | ${b.totalMs} | ${a.totalMs} | ${pctDelta(b.totalMs, a.totalMs)} | ${b.db.totalDbMs} | ${a.db.totalDbMs} | ${pctDelta(b.db.totalDbMs, a.db.totalDbMs)} |`,
    );
  }

  lines.push(
    '',
    `**Sum of page totals:** before ${totalBefore}ms → after ${totalAfter}ms (${pctDelta(totalBefore, totalAfter)})`,
    '',
    '## SQL query counts',
    '',
    '| Page | Scenario | Before queries | After queries | Delta | Before dupes | After dupes |',
    '|------|----------|----------------|---------------|-------|--------------|-------------|',
  );

  for (const key of allKeys) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);
    if (!b || !a) continue;
    lines.push(
      `| ${b.page} | ${b.scenario} | ${b.db.queryCount} | ${a.db.queryCount} | ${pctDelta(b.db.queryCount, a.db.queryCount)} | ${b.db.duplicateQueryCount} | ${a.db.duplicateQueryCount} |`,
    );
  }

  lines.push('', '## Duplicate work removed', '');

  const overviewBefore = beforeMap.get('Overview::default');
  const overviewAfter = afterMap.get('Overview::default');
  if (overviewBefore && overviewAfter) {
    lines.push(
      `- **Overview queue builds:** ${overviewBefore.queueBuilds} → ${overviewAfter.queueBuilds}`,
      `- **Overview payment review fetches:** ${overviewBefore.paymentReviewFetches} → ${overviewAfter.paymentReviewFetches}`,
    );
  }

  const billingDashBefore = beforeMap.get('Billing Centre::tab=dashboard');
  const billingDashAfter = afterMap.get('Billing Centre::tab=dashboard');
  if (billingDashBefore && billingDashAfter) {
    lines.push(
      `- **Billing dashboard queries:** ${billingDashBefore.db.queryCount} → ${billingDashAfter.db.queryCount} (${pctDelta(billingDashBefore.db.queryCount, billingDashAfter.db.queryCount)})`,
      `- **Billing dashboard SSR:** ${billingDashBefore.totalMs}ms → ${billingDashAfter.totalMs}ms (${pctDelta(billingDashBefore.totalMs, billingDashAfter.totalMs)})`,
    );
  }

  lines.push('', '## Cache effectiveness', '', '| Loader | 1st call (ms) | 2nd call (ms) | Hit? |', '|--------|---------------|---------------|------|');

  const cachePairs: Array<[string, string]> = [
    ['cache: loadAdminNavBadges #1', 'cache: loadAdminNavBadges #2'],
    ['cache: loadOverviewContext #1', 'cache: loadOverviewContext #2'],
    ['cache: loadBillingReconciliationSafe #1', 'cache: loadBillingReconciliationSafe #2'],
    ['cache: loadInvoiceOutstandingSnapshot #1', 'cache: loadInvoiceOutstandingSnapshot #2'],
    ['cache: loadUnifiedOperationsQueue #1', 'cache: loadUnifiedOperationsQueue #2'],
  ];

  for (const [first, second] of cachePairs) {
    const t1 = after.cacheVerification[first] ?? 0;
    const t2 = after.cacheVerification[second] ?? 0;
    const hit = t2 <= Math.max(5, Math.round(t1 * 0.1)) ? 'yes' : 'weak';
    lines.push(`| ${first.replace(' #1', '')} | ${t1} | ${t2} | ${hit} |`);
  }

  lines.push('', '## Queue build counts', '', '| Page | Scenario | Before | After |', '|------|----------|--------|-------|');

  for (const key of allKeys) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);
    if (!b || !a) continue;
    lines.push(`| ${b.page} | ${b.scenario} | ${b.queueBuilds} | ${a.queueBuilds} |`);
  }

  lines.push('', '## Largest remaining bottlenecks', '');

  const ranked = [...after.pages].sort((x, y) => y.db.totalDbMs - x.db.totalDbMs || y.totalMs - x.totalMs);
  for (const p of ranked.slice(0, 5)) {
    lines.push(
      `- **${p.page}** (${p.scenario}): ${p.totalMs}ms SSR, ${p.db.totalDbMs}ms DB, ${p.db.queryCount} queries, ${p.queueBuilds} queue build(s)`,
    );
  }

  lines.push('', '## Recommended next steps', '');

  const overallImprovement =
    totalBefore > 0 ? (totalBefore - totalAfter) / totalBefore : 0;

  if (regressions.length > 0) {
    lines.push('**Regressions (>10% slower):**');
    for (const r of regressions) lines.push(`- ${r}`);
    lines.push('');
  }

  if (overallImprovement < 0.15) {
    lines.push(
      'Further loader-level tuning is **unlikely to produce meaningful gains** without architectural change:',
      '- `force-dynamic` on all admin routes (intentional freshness trade-off)',
      '- Room OS adapter batching when flags are ON',
      '- DB indexes only where pg_stat shows sequential scans on hot paths',
      '- Suspense/streaming UI split (presentation change, not loader dedup)',
    );
  } else {
    lines.push(
      `- Optimizations delivered ~${Math.round(overallImprovement * 100)}% aggregate SSR reduction across simulated pages.`,
      '- Remaining cost is dominated by unavoidable DB reads for live admin data.',
      '- Defer architectural changes unless p95 production SSR still exceeds 2s after deploy.',
    );
  }

  writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`Wrote ${outPath}`);
}

main();
