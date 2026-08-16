#!/usr/bin/env npx tsx
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('verify-focus-residents.ts');
import { closeDb, db } from '../src/db/client';
import { sql } from 'drizzle-orm';
import { prorateForMonth } from '../src/services/billing';
import { resolveMonthlyRentPaiseForBooking } from '../src/lib/billing/rentPricingSsot';
import { addDays, formatDate, parseDate } from '../src/lib/dates';
import { paiseToInr } from '../src/lib/format';

async function focus(code: string) {
  const [bk] = await db.execute<{ id: string }>(sql`
    SELECT id::text FROM bookings WHERE booking_code = ${code}
  `);
  if (!bk) return;
  const id = bk.id;
  const invs = await db.execute(sql`
    SELECT invoice_number, invoice_subtype, status, rent_paise, notes, due_date::text
    FROM rent_invoices WHERE booking_id = ${id}::uuid ORDER BY billing_month
  `);
  console.log('\n===', code, '===');
  for (const i of invs) console.log(JSON.stringify(i));
  const resolved = await resolveMonthlyRentPaiseForBooking(id, '2026-07-01');
  console.log('resolvedRent', resolved.rentPaise, paiseToInr(resolved.rentPaise));
  const [rbp] = await db.execute(sql`
    SELECT rent_amount_paise, billing_cycle_policy, billing_day FROM resident_billing_profiles WHERE booking_id = ${id}::uuid
  `);
  console.log('profile', JSON.stringify(rbp));
}

async function main() {
  await focus('APG-2026-0094');
  await focus('APG-2026-0090');
  const pr = prorateForMonth({
    monthlyRatePaise: 412080,
    billingMonth: '2026-09-01',
    activeStart: '2026-09-09',
    activeEnd: formatDate(addDays(parseDate('2026-09-30'), 1)),
  });
  console.log('\nSASWAT_BRIDGE', pr.amountPaise, paiseToInr(pr.amountPaise));
  const prSyed = prorateForMonth({
    monthlyRatePaise: 360570,
    billingMonth: '2026-07-01',
    activeStart: '2026-07-29',
    activeEnd: formatDate(addDays(parseDate('2026-07-31'), 1)),
  });
  console.log('SYED_PRORATE_360570', prSyed.amountPaise, paiseToInr(prSyed.amountPaise));
}

main().then(() => closeDb()).catch((e) => { console.error(e); closeDb().finally(() => process.exit(1)); });
