#!/usr/bin/env npx tsx
/**
 * Read-only production audit for Manjusha Bhosale (Manju) · CENTRAL 402 B3.
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('audit-manju-production');

import { sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { paiseToInr } from '@/src/lib/format';
import { getResidentFinancialAccount } from '@/src/services/residentFinancialEngine';

async function main() {
  const customers = await db.execute(sql`
    SELECT c.id, c.full_name, c.phone, c.residency_status
    FROM customers c
    WHERE c.full_name ILIKE '%manjusha%' OR c.full_name ILIKE '%manju%bhosale%'
    ORDER BY c.full_name
  `);
  console.log('\n=== Customers ===');
  console.table(customers);

  const central402 = await db.execute(sql`
    SELECT c.id AS customer_id, c.full_name, c.phone, c.residency_status,
           b.id AS booking_id, b.booking_code, b.status AS booking_status,
           b.expected_checkout_date::text,
           p.name AS pg_name, r.room_number, bd.bed_code,
           br.status AS bed_res_status, br.stay_range::text
    FROM customers c
    JOIN bookings b ON b.customer_id = c.id
    JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    JOIN beds bd ON bd.id = br.bed_id
    JOIN rooms r ON r.id = bd.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    WHERE r.room_number = '402' AND bd.bed_code = 'B3'
      AND p.name ILIKE '%CENTRAL%'
    ORDER BY b.created_at DESC
  `);
  console.log('\n=== 402 B3 CENTRAL history ===');
  console.table(central402);

  const target =
    central402.find(
      (r) =>
        String(r.full_name).toLowerCase().includes('manjusha') &&
        String(r.booking_status) === 'confirmed',
    ) ??
  central402.find((r) => String(r.full_name).toLowerCase().includes('manjusha')) ??
    central402[0];

  if (!target?.booking_id) {
    console.log('No matching booking found for Manju in 402 B3');
    if (customers[0]) {
      await auditBooking(customers[0].id as string);
    }
    await closeDb();
    return;
  }

  console.log('\n=== Target resident ===');
  console.table([target]);
  await auditBooking(target.booking_id as string);

  const currentOccupant = await db.execute(sql`
    SELECT c.full_name, b.booking_code, b.status, br.status AS br_status, br.stay_range::text
    FROM bed_reservations br
    JOIN bookings b ON b.id = br.booking_id
    JOIN customers c ON c.id = b.customer_id
    JOIN beds bd ON bd.id = br.bed_id
    JOIN rooms r ON r.id = bd.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    WHERE r.room_number = '402' AND bd.bed_code = 'B3'
      AND p.name ILIKE '%CENTRAL%'
      AND br.status IN ('active', 'hold')
      AND CURRENT_DATE <@ br.stay_range
  `);
  console.log('\n=== Current occupant 402 B3 (today) ===');
  console.table(currentOccupant);

  await closeDb();
}

async function auditBooking(bookingId: string) {
  let financial: Awaited<ReturnType<typeof getResidentFinancialAccount>> | null = null;
  try {
    financial = await getResidentFinancialAccount(bookingId);
  } catch (e) {
    console.log('\n=== Financial summary (getResidentFinancialAccount failed) ===');
    console.log(e);
  }
  if (financial) {
    console.log('\n=== Financial summary ===');
    console.log({
      outstanding: paiseToInr(financial.totals.outstandingPaise),
      rent: paiseToInr(financial.rent.outstandingPaise),
      electricity: paiseToInr(financial.electricity.outstandingPaise),
      deposit: paiseToInr(financial.deposit.outstandingPaise),
      other: paiseToInr(financial.other.outstandingPaise),
      totalsPaise: financial.totals.outstandingPaise,
    });
  }

  const booking = await db.execute(sql`
    SELECT status, admin_deposit_refund_status, deposit_paise, deposit_due_paise
    FROM bookings WHERE id = ${bookingId}::uuid
  `);
  console.log('\n=== Booking row ===');
  console.table(booking);

  const billing = await db.execute(sql`
    SELECT auto_generate, billing_cycle FROM resident_billing_profiles WHERE booking_id = ${bookingId}::uuid
  `);
  console.log('\n=== Billing profile ===');
  console.table(billing);

  const vacating = await db.execute(sql`
    SELECT id, status, vacating_date::text, created_at::text
    FROM vacating_requests WHERE booking_id = ${bookingId}::uuid ORDER BY updated_at DESC
  `);
  console.log('\n=== Vacating requests ===');
  console.table(vacating);

  const settlements = await db.execute(sql`
    SELECT id, status, final_refund_paise, notice_deduction_paise, electricity_share_paise,
           amounts_locked, payout_upi_id
    FROM checkout_settlements WHERE booking_id = ${bookingId}::uuid AND status <> 'archived'
  `);
  console.log('\n=== Checkout settlements ===');
  console.table(settlements);

  const invoices = await db.execute(sql`
    SELECT id, invoice_type, status, total_paise, period_start::text, period_end::text
    FROM rent_invoices WHERE booking_id = ${bookingId}::uuid
    ORDER BY period_start DESC LIMIT 15
  `);
  console.log('\n=== Rent invoices ===');
  console.table(
    invoices.map((i) => ({
      ...i,
      total: paiseToInr(Number(i.total_paise)),
    })),
  );

  const elecInv = await db.execute(sql`
    SELECT id, status, total_paise, period_start::text
    FROM electricity_invoices WHERE booking_id = ${bookingId}::uuid
    ORDER BY period_start DESC LIMIT 5
  `);
  console.log('\n=== Electricity invoices ===');
  console.table(
    elecInv.map((i) => ({
      ...i,
      total: paiseToInr(Number(i.total_paise)),
    })),
  );

  const bedNow = await db.execute(sql`
    SELECT br.status, br.stay_range::text, bd.bed_code, r.room_number, p.name
    FROM bed_reservations br
    JOIN beds bd ON bd.id = br.bed_id
    JOIN rooms r ON r.id = bd.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    WHERE br.booking_id = ${bookingId}::uuid AND br.kind = 'primary'
  `);
  console.log('\n=== Bed reservation ===');
  console.table(bedNow);

  const ledger = await db.execute(sql`
    SELECT entry_kind, amount_paise, reason, created_at::text
    FROM deposit_ledger WHERE booking_id = ${bookingId}::uuid ORDER BY created_at
  `);
  console.log('\n=== Deposit ledger ===');
  console.table(
    ledger.map((l) => ({
      ...l,
      amount: paiseToInr(Number(l.amount_paise)),
    })),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
