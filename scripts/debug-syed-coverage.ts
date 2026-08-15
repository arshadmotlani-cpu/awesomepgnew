#!/usr/bin/env npx tsx
import { eq } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('debug-syed-coverage.ts');
import { closeDb, db } from '../src/db/client';
import { bookings } from '../src/db/schema';
import { loadBillingCoverageModel } from '../src/services/billingCoverage';
import { findFirstUncoveredCalendarMonth } from '../src/lib/billing/billingCoverageModel';
import { todayString } from '@/src/lib/dates';
import { sql } from 'drizzle-orm';

async function main() {
  const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, 'APG-2026-0090')).limit(1);
  const coverage = await loadBillingCoverageModel({ bookingId: bk!.id });
  const [profile] = await db.execute<{ first_auto: string }>(sql`
    SELECT first_auto_billing_date::text as first_auto FROM resident_billing_profiles WHERE booking_id = ${bk!.id}
  `);
  console.log('paidUntil', coverage?.paidUntilDate);
  console.log('paidCoverage', JSON.stringify(coverage?.paidInvoiceCoverage));
  console.log('firstAuto', profile[0]?.first_auto);
  console.log('today', todayString());
  const u = findFirstUncoveredCalendarMonth({
    paidUntilDate: coverage?.paidUntilDate ?? null,
    firstAutoBillingDate: profile[0]?.first_auto ?? '2026-08-01',
    paidInvoiceCoverage: coverage?.paidInvoiceCoverage ?? [],
    asOf: todayString(),
  });
  console.log('uncovered', u);
}

main().then(() => closeDb());
