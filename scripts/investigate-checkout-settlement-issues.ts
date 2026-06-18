/* eslint-disable no-console */
/**
 * Read-only audit for duplicate checkout settlements, deposit ledger, and active booking.
 *
 * Usage:
 *   npx tsx scripts/investigate-checkout-settlement-issues.ts
 *   npx tsx scripts/investigate-checkout-settlement-issues.ts --phone=6369363982
 *   npx tsx scripts/investigate-checkout-settlement-issues.ts --booking=APG-2026-0010
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { paiseToInr } from '@/src/lib/format';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

async function main() {
  const phone = arg('phone') ?? '6369363982';
  const bookingCode = arg('booking');

  console.log('\n=== Checkout settlement investigation (read-only) ===\n');
  console.log(`Filter phone: *${phone}*`);
  if (bookingCode) console.log(`Filter booking: ${bookingCode}`);

  const customers = await db.execute(sql`
    SELECT id, full_name, phone FROM customers
    WHERE phone ILIKE ${'%' + phone + '%'}
       OR full_name ILIKE '%harish%'
  `);
  console.log('\n--- Customers ---');
  console.table(customers);

  const bookings = await db.execute(sql`
    SELECT
      b.id,
      b.booking_code,
      b.status AS booking_status,
      b.deposit_paise,
      b.created_at,
      c.full_name,
      c.phone,
      EXISTS (
        SELECT 1 FROM bed_reservations br
        WHERE br.booking_id = b.id
          AND br.kind = 'primary'
          AND br.status = 'active'
          AND CURRENT_DATE <@ br.stay_range
      ) AS active_stay_today,
      (
        SELECT br.status FROM bed_reservations br
        WHERE br.booking_id = b.id AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      ) AS latest_primary_reservation_status,
      (
        SELECT p.name || ' R' || r.room_number || ' ' || bd.bed_code
        FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        INNER JOIN rooms r ON r.id = bd.room_id
        INNER JOIN floors f ON f.id = r.floor_id
        INNER JOIN pgs p ON p.id = f.pg_id
        WHERE br.booking_id = b.id AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      ) AS bed_label
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE c.phone ILIKE ${'%' + phone + '%'}
       OR c.full_name ILIKE '%harish%'
       OR (${bookingCode ?? null}::text IS NOT NULL AND b.booking_code = ${bookingCode ?? null})
    ORDER BY b.created_at ASC
  `);
  console.log('\n--- Bookings ---');
  for (const b of bookings) {
    console.log({
      ...b,
      deposit_required: paiseToInr(b.deposit_paise as number),
      active_stay_today: b.active_stay_today,
    });
  }

  const vacating = await db.execute(sql`
    SELECT
      vr.id,
      b.booking_code,
      vr.status,
      vr.vacating_date,
      vr.deduction_paise,
      vr.monthly_rent_paise_snapshot,
      cs.id AS settlement_id,
      cs.status AS settlement_status
    FROM vacating_requests vr
    INNER JOIN bookings b ON b.id = vr.booking_id
    INNER JOIN customers c ON c.id = vr.customer_id
    WHERE c.phone ILIKE ${'%' + phone + '%'}
       OR c.full_name ILIKE '%harish%'
    ORDER BY vr.created_at ASC
  `);
  console.log('\n--- Vacating requests + settlements ---');
  for (const v of vacating) {
    console.log({
      booking: v.booking_code,
      vacating_status: v.status,
      vacating_date: v.vacating_date,
      notice_deduction: paiseToInr(v.deduction_paise as number),
      monthly_rent: paiseToInr(v.monthly_rent_paise_snapshot as number),
      settlement_id: v.settlement_id ?? '(none)',
      settlement_status: v.settlement_status ?? '—',
    });
  }

  const settlements = await db.execute(sql`
    SELECT
      cs.id,
      b.booking_code,
      cs.status,
      cs.notice_deduction_paise,
      cs.electricity_share_paise,
      cs.deposit_required_paise,
      cs.created_at
    FROM checkout_settlements cs
    INNER JOIN bookings b ON b.id = cs.booking_id
    INNER JOIN customers c ON c.id = cs.customer_id
    WHERE c.phone ILIKE ${'%' + phone + '%'}
       OR c.full_name ILIKE '%harish%'
    ORDER BY cs.created_at ASC
  `);
  console.log('\n--- Checkout settlements ---');
  for (const s of settlements) {
    console.log({
      id: s.id,
      booking: s.booking_code,
      status: s.status,
      notice_deduction: paiseToInr(s.notice_deduction_paise as number),
      electricity: paiseToInr(s.electricity_share_paise as number),
      deposit_required: paiseToInr(s.deposit_required_paise as number),
    });
  }

  const bookingIds = bookings.map((b) => b.id as string);
  if (bookingIds.length > 0) {
    const ledger = await db.execute(sql`
      SELECT
        b.booking_code,
        dl.entry_kind,
        dl.amount_paise,
        dl.reason,
        dl.created_at
      FROM deposit_ledger dl
      INNER JOIN bookings b ON b.id = dl.booking_id
      WHERE dl.booking_id = ANY(${bookingIds}::uuid[])
      ORDER BY b.booking_code, dl.created_at ASC
    `);
    console.log('\n--- Deposit ledger (per booking) ---');
    let currentCode = '';
    let sum = 0;
    for (const e of ledger) {
      if (e.booking_code !== currentCode) {
        if (currentCode) {
          console.log(`  → net balance: ${paiseToInr(sum)} (${sum} paise)\n`);
        }
        currentCode = e.booking_code as string;
        sum = 0;
        console.log(`\n${currentCode}:`);
      }
      const amt = Number(e.amount_paise);
      sum += amt;
      console.log(
        `  ${e.entry_kind} ${paiseToInr(amt)} (${amt} paise) — ${String(e.reason).slice(0, 80)}`,
      );
    }
    if (currentCode) {
      console.log(`  → net balance: ${paiseToInr(sum)} (${sum} paise)\n`);
    }
  }

  console.log('\n--- Active booking recommendation ---');
  const active = bookings.filter((b) => b.active_stay_today);
  if (active.length === 1) {
    console.log(`Use booking ${active[0].booking_code} (active stay today).`);
  } else if (active.length === 0) {
    console.log('No booking with active primary stay today — resident may already be vacated.');
    const approved = vacating.filter((v) => v.status === 'approved');
    if (approved.length === 1) {
      console.log(`Operational vacating: ${approved[0].booking_code} (approved).`);
    }
  } else {
    console.log('Multiple active bookings — manual review required.');
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
