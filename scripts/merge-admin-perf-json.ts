/**
 * Merge multiple admin-perf JSON artifacts into one report (same label).
 *
 *   npx tsx scripts/merge-admin-perf-json.ts test-results/a.json test-results/b.json -o test-results/admin-perf-after.json
 */

import { readFileSync, writeFileSync } from 'node:fs';

type ProfileReport = {
  label: string;
  runAt: string;
  billingMonth: string;
  pages: Array<{ page: string; scenario: string } & Record<string, unknown>>;
  cacheVerification: Record<string, number>;
  notes: string[];
};

function pageKey(p: { page: string; scenario: string }): string {
  return `${p.page}::${p.scenario}`;
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('-o');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const inputs = args.filter((a, i) => a !== '-o' && (outIdx < 0 || i !== outIdx + 1));

  if (!outPath || inputs.length === 0) {
    console.error('Usage: merge-admin-perf-json.ts <a.json> [b.json ...] -o <out.json>');
    process.exit(1);
  }

  const reports = inputs.map((p) => JSON.parse(readFileSync(p, 'utf8')) as ProfileReport);
  const mergedPages = new Map<string, ProfileReport['pages'][0]>();

  for (const report of reports) {
    for (const page of report.pages) {
      mergedPages.set(pageKey(page), page);
    }
  }

  const base = reports[reports.length - 1];
  const cacheVerification = reports.reduce(
    (acc, r) => ({ ...acc, ...r.cacheVerification }),
    {} as Record<string, number>,
  );

  const merged: ProfileReport = {
    label: base.label,
    runAt: new Date().toISOString(),
    billingMonth: base.billingMonth,
    pages: [...mergedPages.values()].sort((a, b) =>
      `${a.page}::${a.scenario}`.localeCompare(`${b.page}::${b.scenario}`),
    ),
    cacheVerification,
    notes: [
      ...new Set(reports.flatMap((r) => r.notes)),
      `Merged from: ${inputs.join(', ')}`,
    ],
  };

  writeFileSync(outPath, JSON.stringify(merged, null, 2));
  console.log(`Wrote ${outPath} (${merged.pages.length} pages)`);
}

main();
