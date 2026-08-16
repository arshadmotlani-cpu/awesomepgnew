#!/usr/bin/env npx tsx
import { eq } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('audit-saswat-coverage.ts');
import { closeDb, db } from '../src/db/client';
import { bookings } from '../src/db/schema';
import { loadBillingCoverageModel } from '../src/services/billingCoverage';
import { getBookingMoneyBalances } from '../src/services/bookingMoneyBalances';
import { prorateForMonth } from '../src/services/billing';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';
import { evaluateAnniversaryRentGenerationEligibility } from '../src/services/rentInvoices';

async function main() {
  const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, 'APG-2026-0094')).limit(1);
  const cov = await loadBillingCoverageModel({ bookingId: bk!.id });
  const money = await getBookingMoneyBalances(bk!.id);
  console.log('paidUntil', cov?.paidUntilDate);
  console.log('paidCoverage', JSON.stringify(cov?.paidInvoiceCoverage));
  console.log('rentReceived', money?.rent.receivedPaise, 'outstanding', money?.rent.outstandingPaise);

  const pr = prorateForMonth({
    monthlyRatePaise: 412080,
    billingMonth: '2026-09-01',
    activeStart: '2026-09-09',
    activeEnd: formatDate(addDays(parseDate('2026-09-30'), 1)),
  });
  console.log('sep9_30_bridge', pr.daysActive, 'days', paiseToInr(pr.amountPaise));

  for (const m of ['2026-09-01', '2026-10-01']) {
    const e = await evaluateAnniversaryRentGenerationEligibility({
      bookingId: bk!.id,
      billingMonth: m,
      asOf: m,
      forceAll: false,
    });
    console.log('elig', m, e.eligible, e.skipCode, e.rentPaise);
  }
}
main().then(() => closeDb());
