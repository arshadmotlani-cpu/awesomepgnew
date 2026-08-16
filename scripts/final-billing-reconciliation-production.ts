#!/usr/bin/env npx tsx
/**
 * Full resident-by-resident billing reconciliation for active monthly residents.
 *   USE_PRODUCTION_DB=1 npx tsx scripts/final-billing-reconciliation-production.ts
 */
import { sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('final-billing-reconciliation-production.ts');
import { closeDb, db } from '../src/db/client';
import { previewBillingCycleMigration } from '../src/services/billingCycleMigration';
import { loadBillingCoverageModel } from '../src/services/billingCoverage';
import { evaluateAnniversaryRentGenerationEligibility } from '../src/services/rentInvoices';
import { parseBillingPeriodFromInvoiceNotes } from '../src/lib/billing/billingCoverageModel';
import { prorateForMonth } from '../src/services/billing';
import { addDays, formatDate, parseDate } from '../src/lib/dates';

function periodsOverlap(
  a: { periodStart: string; periodEnd: string },
  b: { periodStart: string; periodEnd: string },
): boolean {
  return a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd;
}
import { paiseToInr } from '../src/lib/format';

type Issue = { code: string; name: string; kind: string; detail: string };

async function main() {
  const rows = await db.execute<{
    booking_id: string;
    booking_code: string;
    name: string;
    policy: string;
    billing_day: number;
    check_in: string;
    rent_paise: number;
  }>(sql`
    SELECT b.id::text as booking_id, b.booking_code, c.full_name as name,
           rbp.billing_cycle_policy as policy, rbp.billing_day, rbp.rent_amount_paise as rent_paise,
           to_char(lower(br.stay_range), 'YYYY-MM-DD') as check_in
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    JOIN resident_billing_profiles rbp ON rbp.booking_id = b.id
    JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary' AND br.status = 'active'
    WHERE b.status = 'confirmed' AND b.is_test = false AND c.is_test = false
      AND CURRENT_DATE <@ br.stay_range
      AND b.duration_mode IN ('monthly', 'open_ended')
    ORDER BY c.full_name
  `);

  const issues: Issue[] = [];
  let calendarCount = 0;
  let overlapping = 0;
  let missingCoverage = 0;
  let duplicateCoverage = 0;
  let invalidTransitions = 0;

  for (const row of rows) {
    if (row.policy === 'calendar_month_1st') calendarCount += 1;
    else {
      issues.push({
        code: row.booking_code,
        name: row.name,
        kind: 'wrong_policy',
        detail: `policy=${row.policy} billing_day=${row.billing_day}`,
      });
    }

    if (row.billing_day !== 1 && row.policy === 'calendar_month_1st') {
      issues.push({
        code: row.booking_code,
        name: row.name,
        kind: 'wrong_billing_day',
        detail: `billing_day=${row.billing_day}`,
      });
    }

    const coverage = await loadBillingCoverageModel({ bookingId: row.booking_id });
    const preview = await previewBillingCycleMigration(row.booking_id);

    if ('transition' in preview && preview.transition && row.policy === 'calendar_month_1st') {
      invalidTransitions += 1;
      issues.push({
        code: row.booking_code,
        name: row.name,
        kind: 'migration_transition_still_needed',
        detail: JSON.stringify(preview.transition),
      });
    }

    const invs = await db.execute<{
      invoice_number: string;
      subtype: string;
      status: string;
      notes: string | null;
      rent_paise: number;
      due_date: string | null;
      is_adhoc: boolean;
    }>(sql`
      SELECT invoice_number, invoice_subtype as subtype, status, notes, rent_paise,
             due_date::text, is_adhoc
      FROM rent_invoices WHERE booking_id = ${row.booking_id}::uuid
      ORDER BY billing_month, created_at
    `);

    const payable = invs.filter((i) =>
      ['pending', 'overdue', 'payment_in_progress'].includes(i.status),
    );
    const validPaid = invs.filter((i) => i.status === 'paid' && !i.invoice_number.startsWith('OPTV'));

    const periods = invs
      .filter((i) => i.status !== 'cancelled' && !i.invoice_number.startsWith('OPTV'))
      .map((i) => ({
        inv: i.invoice_number,
        subtype: i.subtype,
        status: i.status,
        parsed: parseBillingPeriodFromInvoiceNotes(i.notes),
      }))
      .filter((p) => p.parsed);

    for (let i = 0; i < periods.length; i++) {
      for (let j = i + 1; j < periods.length; j++) {
        const a = periods[i]!.parsed!;
        const b = periods[j]!.parsed!;
        if (periodsOverlap(a, b)) {
          overlapping += 1;
          issues.push({
            code: row.booking_code,
            name: row.name,
            kind: 'overlapping_periods',
            detail: `${periods[i]!.inv} (${a.periodStart}→${a.periodEnd}) vs ${periods[j]!.inv}`,
          });
        }
      }
    }

    for (const inv of payable) {
      if (inv.subtype === 'billing_cycle_transition') {
        if (inv.due_date) {
          invalidTransitions += 1;
          issues.push({
            code: row.booking_code,
            name: row.name,
            kind: 'transition_has_due_date',
            detail: inv.invoice_number,
          });
        }
      }
    }

    const sepElig = await evaluateAnniversaryRentGenerationEligibility({
      bookingId: row.booking_id,
      billingMonth: '2026-09-01',
      asOf: '2026-09-01',
      forceAll: false,
    });

    const sepPayableFull = payable.filter(
      (i) =>
        i.subtype === 'standard' &&
        !i.is_adhoc &&
        parseBillingPeriodFromInvoiceNotes(i.notes)?.periodStart === '2026-09-01',
    );
    const sepTransition = payable.filter((i) => i.subtype === 'billing_cycle_transition');

    if (sepElig.eligible && sepPayableFull.length > 0) {
      duplicateCoverage += 1;
      issues.push({
        code: row.booking_code,
        name: row.name,
        kind: 'sep_full_month_when_partial_due',
        detail: sepPayableFull.map((i) => i.invoice_number).join(','),
      });
    }

    if (!sepElig.eligible && sepElig.skipCode === 'already_covered' && sepTransition.length === 0) {
      const hasSepPaid = validPaid.some(
        (i) => parseBillingPeriodFromInvoiceNotes(i.notes)?.periodStart === '2026-09-01',
      );
      if (!hasSepPaid && row.check_in < '2026-09-01') {
        missingCoverage += 1;
        issues.push({
          code: row.booking_code,
          name: row.name,
          kind: 'missing_sep_coverage',
          detail: `paidUntil=${coverage?.paidUntilDate ?? 'null'}`,
        });
      }
    }

    if (row.booking_code === 'APG-2026-0094') {
      const saswatBridge = payable.filter(
        (i) =>
          i.subtype === 'billing_cycle_transition' &&
          parseBillingPeriodFromInvoiceNotes(i.notes)?.periodStart === '2026-09-09',
      );
      const saswatWrong = invs.filter(
        (i) =>
          i.status === 'pending' &&
          parseBillingPeriodFromInvoiceNotes(i.notes)?.periodStart === '2026-08-13',
      );
      if (saswatBridge.length !== 1) {
        issues.push({
          code: row.booking_code,
          name: row.name,
          kind: 'saswat_bridge_count',
          detail: `expected 1 bridge, got ${saswatBridge.length}`,
        });
      }
      if (saswatWrong.length > 0) {
        issues.push({
          code: row.booking_code,
          name: row.name,
          kind: 'saswat_wrong_pending',
          detail: saswatWrong.map((i) => i.invoice_number).join(','),
        });
      }
      const cancelledOverlap = invs.filter(
        (i) =>
          i.status === 'cancelled' &&
          parseBillingPeriodFromInvoiceNotes(i.notes)?.periodStart === '2026-08-13',
      );
      if (cancelledOverlap.length === 0) {
        issues.push({
          code: row.booking_code,
          name: row.name,
          kind: 'saswat_cancelled_overlap_missing',
          detail: 'expected cancelled Aug 13-31 invoice',
        });
      }
    }

    if (row.booking_code === 'APG-2026-0090') {
      const julTransition = payable.filter(
        (i) =>
          i.subtype === 'billing_cycle_transition' &&
          parseBillingPeriodFromInvoiceNotes(i.notes)?.periodStart === '2026-07-29',
      );
      const augStandard = payable.filter(
        (i) =>
          i.subtype === 'standard' &&
          !i.is_adhoc &&
          parseBillingPeriodFromInvoiceNotes(i.notes)?.periodStart === '2026-08-01',
      );
      const sepStandard = payable.filter(
        (i) =>
          i.subtype === 'standard' &&
          !i.is_adhoc &&
          parseBillingPeriodFromInvoiceNotes(i.notes)?.periodStart === '2026-09-01',
      );
      if (julTransition.length !== 1) {
        issues.push({
          code: row.booking_code,
          name: row.name,
          kind: 'syed_jul_transition',
          detail: `count=${julTransition.length}`,
        });
      }
      if (augStandard.length !== 1) {
        issues.push({
          code: row.booking_code,
          name: row.name,
          kind: 'syed_aug_standard',
          detail: `count=${augStandard.length}`,
        });
      }
      if (sepStandard.length > 0) {
        issues.push({
          code: row.booking_code,
          name: row.name,
          kind: 'syed_sep_full_pending',
          detail: sepStandard.map((i) => i.invoice_number).join(','),
        });
      }
      const expectedTransitionPaise = prorateForMonth({
        monthlyRatePaise: row.rent_paise,
        billingMonth: '2026-07-01',
        activeStart: '2026-07-29',
        activeEnd: formatDate(addDays(parseDate('2026-07-31'), 1)),
      }).amountPaise;
      if (julTransition[0] && Number(julTransition[0].rent_paise) !== expectedTransitionPaise) {
        issues.push({
          code: row.booking_code,
          name: row.name,
          kind: 'syed_transition_amount',
          detail: `got ${julTransition[0].rent_paise} expected ${expectedTransitionPaise}`,
        });
      }
    }
  }

  console.log('ACTIVE_MONTHLY_RESIDENTS', rows.length);
  console.log('ON_CALENDAR_MONTH_1ST', calendarCount);
  console.log('BILLING_ISSUES', issues.length);
  console.log('OVERLAPPING_INVOICES', overlapping);
  console.log('MISSING_COVERAGE', missingCoverage);
  console.log('DUPLICATE_COVERAGE', duplicateCoverage);
  console.log('INVALID_TRANSITIONS', invalidTransitions);

  for (const i of issues) {
    console.log(`ISSUE [${i.kind}] ${i.code} ${i.name}: ${i.detail}`);
  }

  if (issues.length === 0) {
    console.log('AUDIT_PASS');
  }
}

main()
  .then(() => closeDb())
  .catch((e) => {
    console.error(e);
    closeDb().finally(() => process.exit(1));
  });
