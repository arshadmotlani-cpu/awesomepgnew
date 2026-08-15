#!/usr/bin/env npx tsx
/** Backfill Syed Ahmed August standard invoice after migration (idempotent). */
import { eq, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('repair-syed-august-invoice.ts');
import { closeDb, db } from '../src/db/client';
import { bookings } from '../src/db/schema';
import { generateRentInvoicesForMonth } from '../src/services/rentInvoices';
import { loadBillingCoverageModel } from '../src/services/billingCoverage';
import { findFirstUncoveredCalendarMonth } from '../src/lib/billing/billingCoverageModel';
import { todayString } from '@/src/lib/dates';

const CODE = 'APG-2026-0090';

async function main() {
  const [bk] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.bookingCode, CODE))
    .limit(1);
  if (!bk) throw new Error('booking not found');

  const coverage = await loadBillingCoverageModel({ bookingId: bk.id });
  const [profile] = await db.execute<{ first_auto: string }>(sql`
    SELECT first_auto_billing_date::text as first_auto
    FROM resident_billing_profiles WHERE booking_id = ${bk.id}
  `);

  const uncovered = findFirstUncoveredCalendarMonth({
    paidUntilDate: coverage?.paidUntilDate ?? null,
    firstAutoBillingDate: profile[0]?.first_auto ?? '2026-08-01',
    paidInvoiceCoverage: coverage?.paidInvoiceCoverage ?? [],
    asOf: todayString(),
  });

  console.log('uncoveredMonth', uncovered);
  if (!uncovered) {
    console.log('No uncovered month — skip');
    return;
  }

  const gen = await generateRentInvoicesForMonth({
    billingMonth: uncovered,
    asOf: todayString(),
    forceAll: true,
    bookingIds: [bk.id],
  });
  console.log('generated', JSON.stringify(gen));
}

main().then(() => closeDb()).catch((e) => {
  console.error(e);
  closeDb().finally(() => process.exit(1));
});
