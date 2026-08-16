#!/usr/bin/env npx tsx
/**
 * Read-only billing consistency audit for active monthly residents.
 *   USE_PRODUCTION_DB=1 npx tsx scripts/audit-billing-consistency-production.ts
 */
import { sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('audit-billing-consistency-production.ts');
import { closeDb, db } from '../src/db/client';
import { previewBillingCycleMigration } from '../src/services/billingCycleMigration';
import { loadBillingCoverageModel } from '../src/services/billingCoverage';
import { evaluateAnniversaryRentGenerationEligibility } from '../src/services/rentInvoices';
import { parseBillingPeriodFromInvoiceNotes } from '../src/lib/billing/billingCoverageModel';

async function main() {
  const rows = await db.execute<{
    booking_id: string;
    booking_code: string;
    name: string;
    policy: string;
    billing_day: number;
  }>(sql`
    SELECT b.id::text as booking_id, b.booking_code, c.full_name as name,
           rbp.billing_cycle_policy as policy, rbp.billing_day
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    JOIN resident_billing_profiles rbp ON rbp.booking_id = b.id
    JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary' AND br.status = 'active'
    WHERE b.status = 'confirmed' AND b.is_test = false AND c.is_test = false
      AND CURRENT_DATE <@ br.stay_range
      AND b.duration_mode IN ('monthly', 'open_ended')
    ORDER BY c.full_name
  `);

  let calendarCount = 0;
  const issues: string[] = [];

  for (const row of rows) {
    if (row.policy === 'calendar_month_1st') calendarCount += 1;

    const coverage = await loadBillingCoverageModel({ bookingId: row.booking_id });
    const preview = await previewBillingCycleMigration(row.booking_id);
    const elig = await evaluateAnniversaryRentGenerationEligibility({
      bookingId: row.booking_id,
      billingMonth: '2026-09-01',
      asOf: '2026-09-01',
      forceAll: false,
    });

    const invs = await db.execute<{
      invoice_number: string;
      subtype: string;
      status: string;
      notes: string | null;
    }>(sql`
      SELECT invoice_number, invoice_subtype as subtype, status, notes
      FROM rent_invoices WHERE booking_id = ${row.booking_id}::uuid
        AND status IN ('pending', 'overdue', 'payment_in_progress')
    `);

    const periods = invs.map((i) => ({
      inv: i.invoice_number,
      parsed: parseBillingPeriodFromInvoiceNotes(i.notes),
    }));

    for (let i = 0; i < periods.length; i++) {
      for (let j = i + 1; j < periods.length; j++) {
        const a = periods[i]!.parsed;
        const b = periods[j]!.parsed;
        if (!a || !b) continue;
        if (a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd) {
          issues.push(
            `${row.booking_code} overlap ${periods[i]!.inv} (${a.periodStart}→${a.periodEnd}) vs ${periods[j]!.inv}`,
          );
        }
      }
    }

    if ('transition' in preview && preview.transition && row.policy === 'calendar_month_1st') {
      issues.push(
        `${row.booking_code} still has migration transition preview after calendar_month_1st`,
      );
    }

    if (row.policy !== 'calendar_month_1st') {
      issues.push(`${row.booking_code} not on calendar_month_1st (${row.policy})`);
    }
  }

  console.log('ACTIVE_MONTHLY', rows.length);
  console.log('CALENDAR_MONTH_1ST', calendarCount);
  console.log('ISSUES', issues.length);
  for (const i of issues) console.log(' -', i);
}

main().then(() => closeDb());
