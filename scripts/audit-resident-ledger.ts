#!/usr/bin/env npx tsx
import { eq, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('audit-resident-ledger.ts');
import { closeDb, db } from '../src/db/client';
import { bookings } from '../src/db/schema';
import { loadBillingCoverageModel } from '../src/services/billingCoverage';
import { previewBillingCycleMigration } from '../src/services/billingCycleMigration';
import { evaluateAnniversaryRentGenerationEligibility } from '../src/services/rentInvoices';
import { prorateForMonth } from '../src/services/billing';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';

const CODES = ['APG-2026-0090', 'APG-2026-0094'];

async function audit(code: string) {
  const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, code)).limit(1);
  if (!bk) return;

  console.log('\n==========', code, '==========');

  const [profile] = await db.execute<{
    billing_cycle_policy: string;
    billing_day: number;
    first_auto: string | null;
    migrated_at: string | null;
    rent_amount_paise: number;
  }>(sql`
    SELECT billing_cycle_policy, billing_day, first_auto_billing_date::text as first_auto,
           billing_cycle_migrated_at::text as migrated_at, rent_amount_paise
    FROM resident_billing_profiles WHERE booking_id = ${bk.id}
  `);
  console.log('PROFILE', JSON.stringify(profile[0]));

  const [checkin] = await db.execute<{ check_in: string }>(sql`
    SELECT to_char(lower(stay_range), 'YYYY-MM-DD') as check_in
    FROM bed_reservations WHERE booking_id = ${bk.id} AND kind = 'primary' LIMIT 1
  `);
  console.log('CHECK_IN', checkin[0]?.check_in);

  const invs = await db.execute<{
    invoice_number: string;
    invoice_subtype: string;
    due_date: string | null;
    billing_month: string;
    rent_paise: number;
    status: string;
    is_adhoc: boolean;
    notes: string | null;
    paid_principal_paise: number;
    paid_at: string | null;
  }>(sql`
    SELECT invoice_number, invoice_subtype, due_date::text, billing_month::text,
           rent_paise, status, is_adhoc, notes, paid_principal_paise, paid_at::text
    FROM rent_invoices WHERE booking_id = ${bk.id} ORDER BY billing_month, created_at
  `);
  for (const i of invs) console.log('INVOICE', JSON.stringify(i));

  const payments = await db.execute(sql`
    SELECT p.id::text, p.amount_paise, p.status, p.created_at::text, p.payment_method
    FROM payments p
  JOIN rent_invoice_payments rip ON rip.payment_id = p.id
  JOIN rent_invoices ri ON ri.id = rip.rent_invoice_id
  WHERE ri.booking_id = ${bk.id}
  ORDER BY p.created_at
  `);
  for (const p of payments) console.log('PAYMENT', JSON.stringify(p));

  const coverage = await loadBillingCoverageModel({ bookingId: bk.id });
  console.log('COVERAGE paidUntil', coverage?.paidUntilDate);
  console.log('COVERAGE periods', JSON.stringify(coverage?.paidInvoiceCoverage));

  const preview = await previewBillingCycleMigration(bk.id);
  if (!('ok' in preview) || preview.ok !== false) {
    const p = preview as Awaited<ReturnType<typeof previewBillingCycleMigration>> & object;
    if ('transition' in p && p.transition) {
      console.log('PREVIEW_TRANSITION', JSON.stringify(p.transition));
    }
    if ('firstAutoBillingDate' in p) console.log('FIRST_AUTO', p.firstAutoBillingDate);
  }

  for (const month of ['2026-09-01', '2026-10-01']) {
    const e = await evaluateAnniversaryRentGenerationEligibility({
      bookingId: bk.id,
      billingMonth: month,
      asOf: month,
      forceAll: false,
    });
    console.log('ELIG', month, JSON.stringify({ eligible: e.eligible, skip: e.skipCode, rent: e.rentPaise }));
  }

  if (code === 'APG-2026-0094') {
    const pr = prorateForMonth({
      monthlyRatePaise: 412080,
      billingMonth: '2026-09-01',
      activeStart: '2026-09-09',
      activeEnd: formatDate(addDays(parseDate('2026-09-30'), 1)),
    });
    console.log('SASWAT_SEP_BRIDGE', JSON.stringify({
      days: pr.daysActive,
      daysInMonth: pr.daysInMonth,
      amountPaise: pr.amountPaise,
      amountInr: paiseToInr(pr.amountPaise),
    }));
  }
}

async function main() {
  for (const c of CODES) await audit(c);
}
main().then(() => closeDb()).catch((e) => { console.error(e); closeDb().finally(() => process.exit(1)); });
