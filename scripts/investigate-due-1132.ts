/* eslint-disable no-console */
/**
 * Trace ₹1,132 (113200 paise) outstanding dues using the SSOT financial engine.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.vercel.prod') });
config({ path: resolve(process.cwd(), '.env.production.local') });
config({ path: resolve(process.cwd(), '.env') });

const TARGET_PAISE = 113200;
const TOLERANCE_PAISE = 100;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const { closeDb } = await import('../src/db/client');
  const { getGlobalFinancialAggregates } = await import('../src/services/residentFinancialEngine');
  const { getBookingFinancialSummary } = await import('../src/services/residentFinancialEngine');
  const { projectInvoice } = await import('../src/services/rentInvoices');
  const { projectElectricityInvoice } = await import('../src/services/electricityBilling');
  const { db } = await import('../src/db/client');
  const { sql, eq } = await import('drizzle-orm');
  const { rentInvoices, electricityInvoices, payments, depositLedger, auditLog } = await import(
    '../src/db/schema',
  );

  console.log('\n=== ₹1,132 due investigation (SSOT engine) ===\n');

  const portfolio = await getGlobalFinancialAggregates();
  console.log('Portfolio grand outstanding:', portfolio.totals.outstandingPaise, 'paise');

  // Scan all confirmed bookings
  const bookings = await db.execute<{
    booking_id: string;
    customer_id: string;
    customer_name: string;
    customer_phone: string;
    booking_code: string;
    deposit_paise: number;
    deposit_due_paise: number;
    pg_id: string;
    pg_name: string;
    room_number: string;
    admin_dues_status: string;
  }>(sql`
    SELECT DISTINCT ON (b.id)
      b.id AS booking_id,
      c.id AS customer_id,
      c.full_name AS customer_name,
      c.phone AS customer_phone,
      b.booking_code,
      b.deposit_paise,
      coalesce(b.deposit_due_paise, 0) AS deposit_due_paise,
      p.id AS pg_id,
      p.name AS pg_name,
      r.room_number,
      b.admin_dues_status
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id
      AND br.kind = 'primary'
      AND br.status IN ('active', 'hold', 'completed')
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE b.status IN ('confirmed', 'completed', 'pending_payment')
    ORDER BY b.id, br.created_at DESC
  `);

  type Match = {
    bookingCode: string;
    customerName: string;
    customerPhone: string;
    bookingId: string;
    customerId: string;
    pgName: string;
    roomNumber: string;
    totalOutstanding: number;
    summary: Awaited<ReturnType<typeof getBookingFinancialSummary>>;
  };

  const matches: Match[] = [];
  const lineMatches: Array<{
    bookingCode: string;
    customerName: string;
    kind: string;
    label: string;
    outstandingPaise: number;
    id: string;
  }> = [];

  for (const row of Array.from(bookings)) {
    const summary = await getBookingFinancialSummary({
      bookingId: row.booking_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      bookingCode: row.booking_code,
      pgId: row.pg_id,
      pgName: row.pg_name,
      roomNumber: row.room_number,
      depositPaise: Number(row.deposit_paise),
      depositDuePaise: Number(row.deposit_due_paise),
    });

    const total = summary.totals.outstandingPaise;
    if (total >= TARGET_PAISE - TOLERANCE_PAISE && total <= TARGET_PAISE + TOLERANCE_PAISE) {
      matches.push({
        bookingCode: row.booking_code,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        bookingId: row.booking_id,
        customerId: row.customer_id,
        pgName: row.pg_name,
        roomNumber: row.room_number,
        totalOutstanding: total,
        summary,
      });
    }

    for (const cat of [summary.rent, summary.deposit, summary.electricity, summary.other] as const) {
      for (const item of cat.items) {
        if (
          item.outstandingPaise >= TARGET_PAISE - TOLERANCE_PAISE &&
          item.outstandingPaise <= TARGET_PAISE + TOLERANCE_PAISE
        ) {
          lineMatches.push({
            bookingCode: row.booking_code,
            customerName: row.customer_name,
            kind: item.kind,
            label: item.label,
            outstandingPaise: item.outstandingPaise,
            id: item.id,
          });
        }
      }
    }
  }

  console.log('\n--- Bookings with grand outstanding ≈ ₹1,132 ---');
  for (const m of matches) {
    console.log(`\n${m.bookingCode} | ${m.customerName} | ${m.pgName} Room ${m.roomNumber}`);
    console.log(`  Total outstanding: ${m.totalOutstanding} paise (₹${(m.totalOutstanding / 100).toFixed(2)})`);
    console.log('  Rent:', m.summary.rent.outstandingPaise, 'Deposit:', m.summary.deposit.outstandingPaise,
      'Elec:', m.summary.electricity.outstandingPaise, 'Other:', m.summary.other.outstandingPaise);
    for (const cat of ['rent', 'deposit', 'electricity', 'other'] as const) {
      const c = m.summary[cat];
      if (c.items.length === 0) continue;
      console.log(`  [${cat}]`);
      for (const item of c.items) {
        console.log(
          `    - ${item.label}: outstanding=${item.outstandingPaise} required=${item.requiredPaise} paid=${item.paidPaise} status=${item.status} due=${item.dueDate} id=${item.id}`,
        );
      }
    }
  }

  console.log('\n--- Individual line items ≈ ₹1,132 ---');
  console.log(JSON.stringify(lineMatches, null, 2));

  const targetBookingId = matches[0]?.bookingId ?? lineMatches[0] ? bookings.find((b) => b.booking_code === lineMatches[0].bookingCode)?.booking_id : undefined;

  if (targetBookingId) {
    console.log('\n========== FULL CALCULATION TRAIL ==========');
    console.log('Booking ID:', targetBookingId);

    const rentRows = await db.select().from(rentInvoices).where(eq(rentInvoices.bookingId, targetBookingId));
    console.log('\n--- Rent invoice projection (projectInvoice) ---');
    for (const inv of rentRows) {
      const p = projectInvoice(inv);
      console.log({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        billingMonth: inv.billingMonth,
        status: inv.status,
        rentPaise: inv.rentPaise,
        paidPrincipalPaise: inv.paidPrincipalPaise,
        paidLateFeePaise: inv.paidLateFeePaise,
        lateFeeLockedPaise: inv.lateFeeLockedPaise,
        accruedLateFeePaise: p.accruedLateFeePaise,
        outstandingPaise: p.outstandingPaise,
        effectiveStatus: p.effectiveStatus,
        dueDate: inv.dueDate,
        createdAt: inv.createdAt,
        notes: inv.notes,
        isAdhoc: inv.isAdhoc,
        cancelledAt: inv.cancelledAt,
        cancellationReason: inv.cancellationReason,
        formula: `${inv.rentPaise} + ${p.accruedLateFeePaise} - ${inv.paidPrincipalPaise} - ${inv.paidLateFeePaise} = ${p.outstandingPaise}`,
      });
    }

    const elecRows = await db.select().from(electricityInvoices).where(eq(electricityInvoices.bookingId, targetBookingId));
    console.log('\n--- Electricity projection ---');
    for (const inv of elecRows) {
      const p = projectElectricityInvoice(inv);
      console.log({
        id: inv.id,
        billingMonth: inv.billingMonth,
        status: inv.status,
        amountPaise: inv.amountPaise,
        paidPaise: inv.paidPaise,
        accruedLateFee: p.accruedLateFeePaise,
        outstandingPaise: p.outstandingPaise,
        dueDate: inv.dueDate,
        createdAt: inv.createdAt,
      });
    }

    const payRows = await db.select().from(payments).where(eq(payments.bookingId, targetBookingId));
    console.log('\n--- Payments ---');
    console.log(JSON.stringify(payRows, null, 2));

    const depRows = await db.select().from(depositLedger).where(eq(depositLedger.bookingId, targetBookingId));
    console.log('\n--- Deposit ledger ---');
    console.log(JSON.stringify(depRows, null, 2));

    const audits = await db.execute(sql`
      SELECT entity, action, created_at, diff
      FROM audit_log
      WHERE entity_id = ${targetBookingId}
         OR entity_id IN (SELECT id::text FROM rent_invoices WHERE booking_id = ${targetBookingId}::uuid)
      ORDER BY created_at DESC
      LIMIT 40
    `);
    console.log('\n--- Audit trail ---');
    console.log(JSON.stringify(audits, null, 2));
  } else {
    console.log('\nNo exact match found. Searching raw rent_paise = 113200...');
    const raw = await db.execute(sql`
      SELECT ri.*, b.booking_code, c.full_name
      FROM rent_invoices ri
      JOIN bookings b ON b.id = ri.booking_id
      JOIN customers c ON c.id = ri.customer_id
      WHERE ri.rent_paise = ${TARGET_PAISE} OR ri.rent_paise = 113000 OR ri.rent_paise = 113300
      ORDER BY ri.created_at DESC LIMIT 20
    `);
    console.log(JSON.stringify(raw, null, 2));
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
