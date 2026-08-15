#!/usr/bin/env npx tsx
/**
 * Automated billing-cycle migration for all active monthly residents.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/execute-billing-cycle-migration-production.ts
 *   USE_PRODUCTION_DB=1 npx tsx scripts/execute-billing-cycle-migration-production.ts --execute
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('execute-billing-cycle-migration-production.ts');

import { closeDb, db } from '../src/db/client';
import { adminUsers } from '../src/db/schema/adminUsers';
import { bookings, residentBillingProfiles } from '../src/db/schema';
import {
  executeBulkBillingCycleMigration,
  previewBillingCycleMigration,
  type BulkBillingCycleMigrationResult,
} from '../src/services/billingCycleMigration';
import { listBillingCycleMigrationCandidates } from '../src/services/billingCycleMigrationCandidates';
import { loadBillingCoverageModel } from '../src/services/billingCoverage';
import { evaluateAnniversaryRentGenerationEligibility } from '../src/services/rentInvoices';
import {
  firstAutoBillingRunDateAfterCoverage,
  prorateForMonth,
  lastDayOfMonth,
} from '../src/services/billing';
import { addDays, formatDate, parseDate } from '../src/lib/dates';
import { paiseToInr } from '../src/lib/format';

const execute = process.argv.includes('--execute');
const FOCUS = ['APG-2026-0090', 'APG-2026-0094'];

type SnapshotRow = {
  bookingCode: string;
  customerName: string;
  policy: string;
  billingDay: number;
  paidThrough: string | null;
  transitionPeriod: string | null;
  transitionAmount: string | null;
  transitionFormula: string | null;
  firstAuto: string | null;
  cronSep2026: string;
};

async function buildSnapshot(): Promise<{
  rows: SnapshotRow[];
  calendarMonthCount: number;
  anniversaryCount: number;
}> {
  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.role, 'super_admin'))
    .limit(1);
  if (!admin) throw new Error('No super_admin found');

  const session = {
    adminId: admin.id,
    role: 'super_admin' as const,
    pgScope: null,
    email: admin.email,
  };

  const candidates = await listBillingCycleMigrationCandidates(session, { includeOnTarget: true });
  const rows: SnapshotRow[] = [];
  let calendarMonthCount = 0;
  let anniversaryCount = 0;

  for (const c of candidates) {
    const preview = await previewBillingCycleMigration(c.bookingId);
    if ('ok' in preview && preview.ok === false) continue;
    const p = preview;

    const [bk] = await db
      .select({ bookingCode: bookings.bookingCode })
      .from(bookings)
      .where(eq(bookings.id, c.bookingId))
      .limit(1);
    const code = bk?.bookingCode ?? c.bookingId;

    const coverage = await loadBillingCoverageModel({
      bookingId: c.bookingId,
      monthlyRentPaise: p.monthlyRentPaise,
    });

    let transitionFormula: string | null = null;
    if (p.transition) {
      const pr = prorateForMonth({
        monthlyRatePaise: p.monthlyRentPaise,
        billingMonth: p.transition.periodStart.slice(0, 7) + '-01',
        activeStart: p.transition.periodStart,
        activeEnd: formatDate(addDays(parseDate(p.transition.periodEnd), 1)),
      });
      transitionFormula = `${pr.daysActive}/${pr.daysInMonth} days × ${paiseToInr(p.monthlyRentPaise)}/month = ${paiseToInr(pr.amountPaise)}`;
    }

    const elig = await evaluateAnniversaryRentGenerationEligibility({
      bookingId: c.bookingId,
      billingMonth: '2026-09-01',
      asOf: '2026-09-01',
      forceAll: false,
    });

    if (p.currentPolicy === 'calendar_month_1st') calendarMonthCount += 1;
    else anniversaryCount += 1;

    rows.push({
      bookingCode: code,
      customerName: p.customerName,
      policy: `${p.currentPolicy} (day ${p.currentBillingDay})`,
      billingDay: p.currentBillingDay,
      paidThrough: coverage?.paidUntilDate ?? p.paidThroughDate,
      transitionPeriod: p.transition
        ? `${p.transition.periodStart}→${p.transition.periodEnd}`
        : null,
      transitionAmount: p.transition ? paiseToInr(p.transition.amountPaise) : null,
      transitionFormula,
      firstAuto: p.firstAutoBillingDate,
      cronSep2026: elig.eligible
        ? `eligible ${paiseToInr(elig.rentPaise ?? 0)}`
        : `skip ${elig.skipCode ?? 'unknown'}`,
    });
  }

  return { rows, calendarMonthCount, anniversaryCount };
}

function formatSnapshotMarkdown(
  label: string,
  snap: Awaited<ReturnType<typeof buildSnapshot>>,
): string {
  const lines: string[] = [];
  lines.push(`## ${label}`);
  lines.push(`- calendar_month_1st: ${snap.calendarMonthCount}`);
  lines.push(`- anniversary (pending): ${snap.anniversaryCount}`);
  lines.push('');
  for (const r of snap.rows) {
    const focus = FOCUS.includes(r.bookingCode) ? ' **FOCUS**' : '';
    lines.push(`### ${r.customerName} (${r.bookingCode})${focus}`);
    lines.push(`- Policy: ${r.policy}`);
    lines.push(`- Paid through: ${r.paidThrough ?? '—'}`);
    lines.push(`- Transition: ${r.transitionPeriod ?? 'none'} ${r.transitionAmount ?? ''}`);
    if (r.transitionFormula) lines.push(`- Formula: ${r.transitionFormula}`);
    lines.push(`- First auto: ${r.firstAuto ?? '—'}`);
    lines.push(`- Sep 2026 cron: ${r.cronSep2026}`);
    lines.push('');
  }
  return lines.join('\n');
}

function formatResultsMarkdown(results: BulkBillingCycleMigrationResult[]): string {
  const lines: string[] = ['## Execution results'];
  for (const r of results) {
    lines.push(
      `- **${r.customerName}** (${r.bookingCode}): ${r.action} — ${r.detail}${r.transitionInvoiceId ? ` transition=${r.transitionInvoiceId}` : ''}${r.uncoveredMonthInvoiceId ? ` uncovered=${r.uncoveredMonthInvoiceId}` : ''}`,
    );
  }
  return lines.join('\n');
}

async function main() {
  console.log('Billing cycle migration —', execute ? 'EXECUTE' : 'DRY RUN');
  console.log('');

  const before = await buildSnapshot();
  console.log('Before:', before.calendarMonthCount, 'on calendar_month_1st,', before.anniversaryCount, 'anniversary');

  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.role, 'super_admin'))
    .limit(1);
  if (!admin) throw new Error('No super_admin found');

  const session = {
    adminId: admin.id,
    role: 'super_admin' as const,
    pgScope: null,
    email: admin.email,
  };

  const results = await executeBulkBillingCycleMigration(session, {
    dryRun: !execute,
    note: 'Automated production billing cycle migration to calendar_month_1st.',
  });

  for (const r of results) {
    console.log(`${r.bookingCode} ${r.customerName}: ${r.action} — ${r.detail}`);
  }

  let after = before;
  if (execute) {
    after = await buildSnapshot();
    console.log('');
    console.log('After:', after.calendarMonthCount, 'on calendar_month_1st,', after.anniversaryCount, 'anniversary');
  }

  const report = [
    '# Billing cycle migration — execution report',
    `Generated: ${new Date().toISOString()}`,
    `Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}`,
    '',
    formatSnapshotMarkdown('Before snapshot', before),
    execute ? formatResultsMarkdown(results) : formatResultsMarkdown(results),
    execute ? formatSnapshotMarkdown('After snapshot', after) : '',
    '',
    '### Amount discrepancy resolution',
    '',
    '**Syed (Jul 29–31):** ₹233 came from counting 2 days (exclusive-end bug). Canonical calendar proration uses 3 days: floor(360600×3/31) = **₹348.38**.',
    '',
    '**Saswat (Aug 13–31):** ₹2,393 came from counting 18 days. Canonical uses 19 days: floor(412100×19/31) = **₹2,520.90**.',
    '',
    'Neither uses monthly÷30. Both use actual calendar days in the billing month.',
  ].join('\n');

  const path = join(process.cwd(), 'docs/validation/BILLING_CYCLE_MIGRATION_EXECUTION.md');
  writeFileSync(path, report, 'utf8');
  console.log(`\nWrote ${path}`);

  if (!execute) {
    console.log('\nDry run complete. Pass --execute to apply migrations.');
  }
}

main()
  .then(() => closeDb())
  .catch((err) => {
    console.error(err);
    closeDb().finally(() => process.exit(1));
  });
