#!/usr/bin/env npx tsx
/**
 * Full checkout accounting audit for Harish · Room 203 B5 · Shanti Nagar PG.
 *
 * Usage:
 *   DATABASE_URL='postgres://…' npx tsx scripts/audit-harish-checkout.ts
 *   DATABASE_URL='…' npx tsx scripts/audit-harish-checkout.ts --booking=APG-2026-0016
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
  const bookingCode = arg('booking') ?? 'APG-2026-0016';

  console.log('\n=== Harish checkout accounting audit ===\n');

  const [customer] = await db.execute(sql`
    SELECT id, full_name, phone FROM customers
    WHERE phone ILIKE ${'%' + phone + '%'} OR full_name ILIKE '%harish%'
    LIMIT 1
  `);
  if (!customer) {
    console.error('Customer not found');
    process.exit(1);
  }

  const bookings = await db.execute(sql`
    SELECT b.id, b.booking_code, b.status, b.deposit_paise, b.admin_deposit_refund_status
    FROM bookings b
    WHERE b.customer_id = ${customer.id}::uuid
    ORDER BY b.created_at DESC
  `);

  const target =
    bookings.find((b) => b.booking_code === bookingCode) ?? bookings[0];
  if (!target) {
    console.error('No booking found');
    process.exit(1);
  }

  const bookingId = target.id as string;

  const [settlement] = await db.execute(sql`
    SELECT cs.*, vr.status AS vacating_status, vr.vacating_date::text
    FROM checkout_settlements cs
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    WHERE cs.booking_id = ${bookingId}::uuid
      AND cs.status <> 'archived'
    ORDER BY cs.updated_at DESC
    LIMIT 1
  `);

  const ledger = await db.execute(sql`
    SELECT entry_kind, amount_paise, reason, created_at
    FROM deposit_ledger
    WHERE booking_id = ${bookingId}::uuid
    ORDER BY created_at ASC
  `);

  const [bed] = await db.execute(sql`
    SELECT br.status, br.kind, r.room_number, bd.bed_code, p.name AS pg_name
    FROM bed_reservations br
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE br.booking_id = ${bookingId}::uuid AND br.kind = 'primary'
    ORDER BY br.created_at DESC
    LIMIT 1
  `);

  let netLedger = 0;
  console.log('--- Customer ---');
  console.table([{ name: customer.full_name, phone: customer.phone }]);

  console.log('\n--- Booking ---');
  console.table([
    {
      code: target.booking_code,
      status: target.status,
      deposit_required: paiseToInr(target.deposit_paise as number),
      admin_deposit_refund_status: target.admin_deposit_refund_status,
    },
  ]);

  if (settlement) {
    const notice = Number(settlement.notice_deduction_paise);
    const elec = Number(settlement.electricity_share_paise);
    const held = Number(settlement.deposit_required_paise);
    const previewRefund = Math.max(0, held - notice - (settlement.electricity_deduct_from_deposit ? elec : 0));

    console.log('\n--- Checkout settlement ---');
    console.table([
      {
        id: settlement.id,
        status: settlement.status,
        amounts_locked: settlement.amounts_locked,
        notice: paiseToInr(notice),
        electricity: paiseToInr(elec),
        final_refund_locked: settlement.final_refund_paise != null ? paiseToInr(Number(settlement.final_refund_paise)) : '(unset)',
        preview_refund: paiseToInr(previewRefund),
        payout_upi: settlement.payout_upi_id ?? '(none)',
        vacating_status: settlement.vacating_status,
        vacating_date: settlement.vacating_date,
      },
    ]);

    console.log('\n--- Expected vs actual ---');
    console.log({
      checkout_complete: ['completed', 'refund_paid'].includes(String(settlement.status)),
      should_require_upi: previewRefund > 0,
      stuck_waiting_on_resident:
        settlement.status === 'awaiting_resident_details' && previewRefund <= 0,
      deposit_still_held_in_ledger: netLedger,
    });
  } else {
    console.log('\nNo active checkout settlement found.');
  }

  console.log('\n--- Deposit ledger ---');
  for (const row of ledger) {
    const amt = Number(row.amount_paise);
    netLedger += amt;
    console.log(
      `  ${row.entry_kind} ${paiseToInr(amt)} — ${String(row.reason).slice(0, 100)} @ ${row.created_at}`,
    );
  }
  console.log(`  → Net wallet balance: ${paiseToInr(netLedger)} (${netLedger} paise)`);

  console.log('\n--- Bed lifecycle ---');
  if (bed) {
    console.table([
      {
        pg: bed.pg_name,
        room: bed.room_number,
        bed: bed.bed_code,
        reservation_status: bed.status,
      },
    ]);
  } else {
    console.log('  No primary bed reservation row.');
  }

  console.log('\n--- Revenue note ---');
  console.log(
    'Notice and electricity recovered via deposit_ledger "deducted" entries at checkout approval — not separate rent invoices.',
  );

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
