#!/usr/bin/env npx tsx
/**
 * Read-only billing-cycle migration verification for production or local DB.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/verify-billing-cycle-migration-production.ts
 *   USE_PRODUCTION_DB=1 npx tsx scripts/verify-billing-cycle-migration-production.ts --markdown > docs/validation/BILLING_CYCLE_MIGRATION_PRODUCTION.md
 */
import { and, eq } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
import { db, closeDb } from '../src/db/client';
import { adminUsers } from '../src/db/schema/adminUsers';
import { bookings, rentInvoices, residentBillingProfiles } from '../src/db/schema';
import {
  listBillingCycleMigrationCandidates,
} from '../src/services/billingCycleMigrationCandidates';
import { previewBillingCycleMigration } from '../src/services/billingCycleMigration';
import { loadBillingCoverageModel } from '../src/services/billingCoverage';
import { evaluateAnniversaryRentGenerationEligibility } from '../src/services/rentInvoices';
import { todayString } from '../src/lib/dates';
import { firstOfMonth } from '../src/services/billing';
import { paiseToInr } from '../src/lib/format';
import { shouldGenerateBillOnDate } from '../src/lib/billing/billingCycleEngine';

loadProductionAuditEnv();
requireDatabaseUrl('verify-billing-cycle-migration-production.ts');

const markdownMode = process.argv.includes('--markdown');
const focusCodes = ['APG-2026-0090'];

type ResidentReport = {
  bookingCode: string;
  customerName: string;
  pgName: string;
  roomBed: string;
  checkIn: string;
  policy: string;
  billingDay: number;
  firstAutoBillingDate: string | null;
  migratedAt: string | null;
  paidThrough: string | null;
  monthlyRent: string;
  transition: string | null;
  invoices: string[];
  cronNext1st: string;
  cronEligibilitySep: string;
  migrationStatus: string;
  recommendation: string;
};

async function buildReportForBooking(bookingId: string, bookingCode: string): Promise<ResidentReport | null> {
  const preview = await previewBillingCycleMigration(bookingId);
  if ('ok' in preview && preview.ok === false) return null;
  const p = preview;

  const [profile] = await db
    .select()
    .from(residentBillingProfiles)
    .where(eq(residentBillingProfiles.bookingId, bookingId))
    .limit(1);

  const invRows = await db
    .select({
      invoiceNumber: rentInvoices.invoiceNumber,
      billingMonth: rentInvoices.billingMonth,
      dueDate: rentInvoices.dueDate,
      rentPaise: rentInvoices.rentPaise,
      status: rentInvoices.status,
      isAdhoc: rentInvoices.isAdhoc,
      subtype: rentInvoices.invoiceSubtype,
      notes: rentInvoices.notes,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, bookingId))
    .orderBy(rentInvoices.billingMonth);

  const coverage = await loadBillingCoverageModel({
    bookingId,
    monthlyRentPaise: p.monthlyRentPaise,
  });

  const nextMonth1st = firstOfMonth(
    `${todayString().slice(0, 7)}-01` === firstOfMonth(todayString())
      ? todayString()
      : firstOfMonth(todayString()),
  );
  const sep2026 = '2026-09-01';
  const elig = await evaluateAnniversaryRentGenerationEligibility({
    bookingId,
    billingMonth: sep2026,
    asOf: '2026-09-01',
    forceAll: false,
  });

  const firstAuto = profile?.firstAutoBillingDate ?? p.firstAutoBillingDate;
  const cronOnSep1 =
    firstAuto && profile
      ? shouldGenerateBillOnDate({
          runDate: '2026-09-01',
          billingDay: profile.billingDay ?? 1,
          firstAutoBillingDate: firstAuto,
        })
      : false;

  const roomBed = [p.roomNumber ? `R${p.roomNumber}` : null, p.bedCode ? `Bed ${p.bedCode}` : null]
    .filter(Boolean)
    .join(' ');

  let recommendation = 'Policy flip only (billing day 1)';
  if (p.lightweightPolicyFlip) {
    recommendation = 'Migrate: policy flip only (anniversary + day 1)';
  } else if (p.transition) {
    recommendation = `Financial transition ${paiseToInr(p.transition.amountPaise)} (${p.transition.periodStart}→${p.transition.periodEnd}) then migrate`;
  } else if (p.alreadyOnTarget) {
    recommendation = 'Already on calendar_month_1st — no action';
  }

  if (bookingCode === 'APG-2026-0090' || p.customerName.toLowerCase().includes('syed')) {
    recommendation = `Syed: transition bill if missing; migrate; verify Aug standard invoice`;
  }
  if (p.customerName.toLowerCase().includes('saswat')) {
    recommendation = `Saswat: transition through paid-through gap; migrate; verify Sep 1 cron does not double-bill`;
  }

  return {
    bookingCode,
    customerName: p.customerName,
    pgName: p.pgName,
    roomBed,
    checkIn: p.checkInDate,
    policy: `${p.currentPolicy} (day ${p.currentBillingDay})`,
    billingDay: p.currentBillingDay,
    firstAutoBillingDate: firstAuto ?? p.firstAutoBillingDate,
    migratedAt: profile?.billingCycleMigratedAt
      ? String(profile.billingCycleMigratedAt)
      : null,
    paidThrough: coverage?.paidUntilDate ?? p.paidThroughDate,
    monthlyRent: paiseToInr(p.monthlyRentPaise),
    transition: p.transition
      ? `${paiseToInr(p.transition.amountPaise)} (${p.transition.periodStart}→${p.transition.periodEnd})`
      : null,
    invoices: invRows.map(
      (i) =>
        `${i.invoiceNumber} ${i.subtype} adhoc=${i.isAdhoc} ${firstOfMonth(String(i.billingMonth))} due=${i.dueDate ?? 'null'} ${paiseToInr(i.rentPaise)} ${i.status}`,
    ),
    cronNext1st: cronOnSep1 ? 'Would run on 2026-09-01' : `Skip on 2026-09-01 (firstAuto=${firstAuto})`,
    cronEligibilitySep: elig.eligible
      ? `eligible rent ${paiseToInr(elig.rentPaise ?? 0)}`
      : `skip: ${elig.skipCode ?? 'unknown'}`,
    migrationStatus: p.blocked ? `blocked: ${p.blockedReason}` : p.alreadyOnTarget ? 'on_target' : 'eligible',
    recommendation,
  };
}

async function main() {
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

  const focusBookings =
    focusCodes.length > 0
      ? await db
          .select({ id: bookings.id, bookingCode: bookings.bookingCode })
          .from(bookings)
          .where(eq(bookings.bookingCode, focusCodes[0]!))
      : [];

  const reports: ResidentReport[] = [];
  const seen = new Set<string>();

  for (const row of candidates) {
    const [bk] = await db
      .select({ bookingCode: bookings.bookingCode })
      .from(bookings)
      .where(eq(bookings.id, row.bookingId))
      .limit(1);
    const code = bk?.bookingCode ?? row.bookingId;
    const report = await buildReportForBooking(row.bookingId, code);
    if (report) {
      reports.push(report);
      seen.add(row.bookingId);
    }
  }

  for (const fb of focusBookings) {
    if (seen.has(fb.id)) continue;
    const report = await buildReportForBooking(fb.id, fb.bookingCode);
    if (report) reports.push(report);
  }

  const lines: string[] = [];
  lines.push('# Billing cycle migration — production verification');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Residents reviewed: ${reports.length}`);
  lines.push('');

  for (const r of reports) {
    lines.push(`## ${r.customerName} (${r.bookingCode})`);
    lines.push(`- PG: ${r.pgName} · ${r.roomBed}`);
    lines.push(`- Check-in: ${r.checkIn} · Rent: ${r.monthlyRent}`);
    lines.push(`- Policy: ${r.policy} · Migrated: ${r.migratedAt ?? '—'}`);
    lines.push(`- Paid through: ${r.paidThrough ?? '—'}`);
    lines.push(`- Transition preview: ${r.transition ?? 'none'}`);
    lines.push(`- First auto bill: ${r.firstAutoBillingDate ?? '—'}`);
    lines.push(`- Cron Sep 2026: ${r.cronNext1st}; eligibility: ${r.cronEligibilitySep}`);
    lines.push(`- **Recommendation:** ${r.recommendation}`);
    lines.push('- Invoices:');
    for (const inv of r.invoices) lines.push(`  - ${inv}`);
    lines.push('');
  }

  const out = lines.join('\n');
  if (markdownMode) {
    const path = join(process.cwd(), 'docs/validation/BILLING_CYCLE_MIGRATION_PRODUCTION.md');
    writeFileSync(path, out, 'utf8');
    console.log(`Wrote ${path}`);
  } else {
    console.log(out);
  }
}

main()
  .then(() => closeDb())
  .catch((err) => {
    console.error(err);
    closeDb().finally(() => process.exit(1));
  });
