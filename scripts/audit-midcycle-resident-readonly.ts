/* eslint-disable no-console */
/**
 * Read-only mid-cycle deposit/rent forensic for a booking code.
 * USE_PRODUCTION_DB=1 npx tsx scripts/audit-midcycle-resident-readonly.ts APG-2026-0112
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-midcycle-resident');

import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bookings, customers, financialInvoices, rentInvoices, residentCreditLedger } from '../src/db/schema';
import { paiseToInr } from '../src/lib/format';
import { getBookingFinancialAccount } from '../src/services/residentFinancialEngine';
import { getDepositSummaryForBooking } from '../src/services/deposits';
import { getBookingMoneyBalances } from '../src/services/bookingMoneyBalances';
import { firstOfMonth } from '../src/services/billing';
import { todayString } from '../src/lib/dates';
import { getResidentCreditBalance } from '../src/services/residentCreditLedger';
import { projectInvoice } from '../src/services/rentInvoices';
import { buildRentInvoiceProjectInput } from '../src/lib/billing/rentInvoiceProjectInput';

const CODE = process.argv[2] ?? 'APG-2026-0112';

async function main() {
  const [ctx] = await db.execute<{
    booking_id: string;
    customer_id: string;
    customer_name: string;
    room_number: string;
    bed_code: string;
    deposit_paise: number;
    deposit_due_paise: number;
    pg_id: string;
    pg_name: string;
  }>(sql`
    SELECT bk.id::text AS booking_id, c.id::text AS customer_id, c.full_name AS customer_name,
           r.room_number, b.bed_code, bk.deposit_paise, coalesce(bk.deposit_due_paise,0) AS deposit_due_paise,
           f.pg_id::text AS pg_id, p.name AS pg_name
    FROM bookings bk
    INNER JOIN customers c ON c.id = bk.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = bk.id AND br.kind='primary' AND br.status='active'
    INNER JOIN beds b ON b.id = br.bed_id
    INNER JOIN rooms r ON r.id = b.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE bk.booking_code = ${CODE}
    LIMIT 1
  `);
  const row = ctx;
  if (!row) throw new Error(`Booking ${CODE} not found`);
  console.log('\n=== RESIDENT ===');
  console.log(row);

  const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, CODE)).limit(1);
  const [cust] = await db.select().from(customers).where(eq(customers.id, bk!.customerId)).limit(1);

  const account = await getBookingFinancialAccount({
    bookingId: bk!.id,
    customerId: bk!.customerId,
    customerName: cust!.fullName,
    customerPhone: cust!.phone ?? '',
    bookingCode: bk!.bookingCode,
    pgId: row.pg_id,
    pgName: row.pg_name,
    roomNumber: row.room_number,
    depositPaise: bk!.depositPaise,
    depositDuePaise: bk!.depositDuePaise ?? 0,
  });

  console.log('\n=== CANONICAL FINANCIAL ACCOUNT (SSOT) ===');
  console.log(JSON.stringify({
    rent: account.rent,
    deposit: account.deposit,
    other: { outstanding: account.other.outstandingPaise, items: account.other.items.length },
    totals: account.totals,
    totalOutstandingPaise: account.totalOutstandingPaise,
    refundBalancePaise: account.refundBalancePaise,
  }, null, 2));

  const depositSummary = await getDepositSummaryForBooking(bk!.id);
  const money = await getBookingMoneyBalances(bk!.id);
  const credit = await getResidentCreditBalance(bk!.customerId);
  const { resolveMonthlyRentPaiseForBooking } = await import('../src/lib/billing/rentPricingSsot');
  const monthlyRent = await resolveMonthlyRentPaiseForBooking(bk!.id, firstOfMonth(todayString()));

  console.log('\n=== DEPOSIT SUMMARY / MONEY BALANCES / CREDIT ===');
  console.log({ depositSummary, money, creditPaise: credit, monthlyRentSsot: monthlyRent });

  console.log('\n=== ROOM CONFIGURATION SCHEDULES (room 203) ===');
  const schedules = await db.execute(sql`
    SELECT s.id::text, s.effective_from::text, s.status, s.target_bed_count,
           s.monthly_rate_paise, s.monthly_deposit_paise, s.applied_at::text, s.created_at::text
    FROM room_configuration_schedules s
    INNER JOIN rooms r ON r.id = s.room_id
    WHERE r.room_number = '203'
    ORDER BY s.effective_from, s.created_at
  `);
  for (const s of schedules) console.log(s);

  console.log('\n=== ROOM CHANGE REQUESTS ===');
  const rcrs = await db.execute(sql`
    SELECT id::text, status, requested_shift_date::text, quote_snapshot, created_at::text
    FROM room_change_requests WHERE booking_id = ${bk!.id}::uuid ORDER BY created_at
  `);
  for (const r of rcrs) console.log(JSON.stringify(r));

  console.log('\n=== FINANCIAL INVOICES ===');
  const fis = await db.select().from(financialInvoices).where(eq(financialInvoices.bookingId, bk!.id));
  for (const fi of fis) {
    console.log({
      id: fi.id,
      number: fi.invoiceNumber,
      type: fi.invoiceType,
      source: fi.sourceTable,
      amount: paiseToInr(fi.amountPaise),
      status: fi.status,
      due: fi.dueDate,
      breakdown: fi.breakdown,
      notes: fi.notes,
      created: fi.createdAt.toISOString(),
    });
  }

  console.log('\n=== RENT INVOICES ===');
  const ris = await db.select().from(rentInvoices).where(eq(rentInvoices.bookingId, bk!.id));
  for (const ri of ris.sort((a, b) => String(a.billingMonth).localeCompare(String(b.billingMonth)))) {
    const p = projectInvoice(buildRentInvoiceProjectInput(ri));
    console.log({
      number: ri.invoiceNumber,
      month: ri.billingMonth,
      subtype: ri.invoiceSubtype,
      isAdhoc: ri.isAdhoc,
      rent: paiseToInr(ri.rentPaise),
      paidPrincipal: paiseToInr(ri.paidPrincipalPaise),
      status: ri.status,
      effective: p.effectiveStatus,
      outstanding: paiseToInr(p.outstandingPaise),
      notes: ri.notes?.slice(0, 100),
    });
  }

  console.log('\n=== RESIDENT CREDIT LEDGER ===');
  const credits = await db.select().from(residentCreditLedger).where(eq(residentCreditLedger.bookingId, bk!.id));
  for (const c of credits) console.log(c);

  console.log('\n=== DEPOSIT LEDGER ===');
  const dledger = await db.execute(sql`
    SELECT entry_kind, amount_paise, reason, created_at::text FROM deposit_ledger
    WHERE booking_id = ${bk!.id}::uuid ORDER BY created_at
  `);
  for (const d of dledger) console.log(d);

  console.log('\n=== BED PRICE HISTORY (bed) ===');
  const prices = await db.execute(sql`
    SELECT effective_from::text, monthly_rate_paise, monthly_security_deposit_paise, created_at::text
    FROM bed_prices WHERE bed_id = (
      SELECT br.bed_id FROM bed_reservations br WHERE br.booking_id = ${bk!.id}::uuid AND br.kind='primary' LIMIT 1
    ) ORDER BY effective_from
  `);
  for (const p of prices) console.log(p);

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
