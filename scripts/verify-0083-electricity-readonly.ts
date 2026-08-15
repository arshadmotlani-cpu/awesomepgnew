#!/usr/bin/env npx tsx
/** Read-only: Room 204 electricity ledger for APG-2026-0083 (Bhuwan). */
import { sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
import { db, closeDb } from '../src/db/client';
import { buildRoomElectricityCheckoutAllocation } from '../src/services/roomElectricityCheckout';
import { loadRoomElectricityContributionsForMonth } from '../src/services/electricityRoomContributions';
import { getElectricitySettlementLedgerView } from '../src/services/electricitySettlementLedgerView';
import { paiseToInr } from '../src/lib/format';

loadProductionAuditEnv();
requireDatabaseUrl('verify-0083-electricity-readonly.ts');

const CODE = 'APG-2026-0083';

async function main() {
  const bookings = await db.execute(sql`
    SELECT b.id, b.booking_code, c.full_name, c.id AS customer_id, r.id AS room_id, r.room_number
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    JOIN beds bd ON bd.id = br.bed_id
    JOIN rooms r ON r.id = bd.room_id
    WHERE b.booking_code = ${CODE}
    LIMIT 1
  `);
  const booking = bookings[0] as Record<string, string> | undefined;
  if (!booking) throw new Error('Booking not found');
  console.log('=== BOOKING ===');
  console.log(booking);

  const vacating = await db.execute(sql`
    SELECT vacating_date, status
    FROM vacating_requests
    WHERE booking_id = ${booking.id}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const vr = vacating[0] as { vacating_date: string; status: string } | undefined;
  console.log('\n=== VACATING ===');
  console.log(vr);

  const roomId = booking.room_id;
  const vacatingDate = String(vr?.vacating_date ?? '').slice(0, 10);
  const billingMonth = `${vacatingDate.slice(0, 7)}-01`;

  const roomMates = await db.execute(sql`
    SELECT b.booking_code, c.full_name, br.stay_range::text, b.status, br.status AS res_status
    FROM bed_reservations br
    JOIN bookings b ON b.id = br.booking_id
    JOIN customers c ON c.id = b.customer_id
    JOIN beds bd ON bd.id = br.bed_id
    WHERE bd.room_id = ${roomId}::uuid
      AND br.kind = 'primary'
      AND br.stay_range && daterange(${billingMonth}::date, (${billingMonth}::date + interval '1 month')::date, '[)')
    ORDER BY lower(br.stay_range)
  `);
  console.log('\n=== ROOMMATES (billing month overlap) ===');
  console.table(roomMates);

  const contributions = await loadRoomElectricityContributionsForMonth(roomId, billingMonth);
  console.log('\n=== CONTRIBUTIONS ===');
  for (const c of contributions.contributions) {
    console.log(`  ${c.customerName}: ${paiseToInr(c.amountPaise)} (${c.kind})`);
  }
  console.log('total:', paiseToInr(contributions.totalPaise), 'legacy:', contributions.usesLegacyFallback);

  const ledgerView = await getElectricitySettlementLedgerView({ roomId, billingMonth });
  console.log('\n=== SETTLEMENT LEDGER VIEW ===');
  if (ledgerView) {
    console.log('total bill:', paiseToInr(ledgerView.totalRoomBillPaise));
    console.log('collected:', paiseToInr(ledgerView.collectedPaise));
    console.log('outstanding:', paiseToInr(ledgerView.outstandingPaise));
    console.log('checkout credits:', ledgerView.checkoutSettlementCredits.map((r) => ({
      name: r.customerName,
      amount: paiseToInr(r.amountPaise),
    })));
    console.log('manual credits:', ledgerView.manualCredits.map((r) => ({
      name: r.customerName,
      amount: paiseToInr(r.amountPaise),
      source: r.source,
    })));
  } else {
    console.log('null');
  }

  const invoices = await db.execute(sql`
    SELECT ei.invoice_number, c.full_name, ei.amount_paise, ei.paid_paise, ei.status
    FROM electricity_invoices ei
    JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
    JOIN customers c ON c.id = ei.customer_id
    WHERE eb.room_id = ${roomId}::uuid
      AND ei.billing_month = ${billingMonth}::date
      AND ei.status <> 'cancelled'
  `);
  console.log('\n=== ELECTRICITY INVOICES ===');
  console.table(invoices);

  const roomLedger = await db.execute(sql`
    SELECT rel.source, c.full_name, rel.amount_paise, rel.collected_at
    FROM room_electricity_ledger_entries rel
    JOIN room_electricity_ledger_cycles rec ON rec.id = rel.cycle_id
    JOIN customers c ON c.id = rel.customer_id
    WHERE rec.room_id = ${roomId}::uuid AND rec.billing_month = ${billingMonth}::date
    ORDER BY rel.collected_at
  `);
  console.log('\n=== ROOM ELECTRICITY LEDGER ENTRIES ===');
  console.table(roomLedger);

  const checkoutLedger = await db.execute(sql`
    SELECT c.full_name, esl.amount_paise, esl.status, esl.created_at
    FROM electricity_settlement_ledger esl
    JOIN customers c ON c.id = esl.customer_id
    WHERE esl.room_id = ${roomId}::uuid AND esl.billing_month = ${billingMonth}::date
  `);
  console.log('\n=== ELECTRICITY SETTLEMENT LEDGER ===');
  console.table(checkoutLedger);

  const totalBillPaise = ledgerView?.totalRoomBillPaise ?? 33_600;
  const bhuwanCsRows = await db.execute(sql`
    SELECT cs.id FROM checkout_settlements cs
    JOIN bookings b ON b.id = cs.booking_id
    WHERE b.booking_code = 'APG-2026-0083'
    ORDER BY cs.updated_at DESC LIMIT 1
  `);
  const excludeSettlementId = (bhuwanCsRows[0] as { id: string } | undefined)?.id ?? null;

  const alloc = await buildRoomElectricityCheckoutAllocation({
    roomId,
    customerId: booking.customer_id,
    vacatingDate,
    totalBillPaise,
    unitsConsumed: null,
    excludeCheckoutSettlementId: excludeSettlementId,
  });
  console.log('\n=== CHECKOUT ALLOCATION (current code) ===');
  console.log('total:', paiseToInr(alloc.totalBillPaise));
  console.log('already collected:', paiseToInr(alloc.alreadyCollectedPaise));
  console.log('remaining:', paiseToInr(alloc.remainingToRecoverPaise));
  console.log('current share:', paiseToInr(alloc.currentResidentSharePaise));
  for (const o of alloc.occupants) {
    console.log(
      `  ${o.customerName}: collected=${paiseToInr(o.collectedPaise)} share=${paiseToInr(o.checkoutSharePaise)} status=${o.settlementStatus}`,
    );
  }

  const settlements = await db.execute(sql`
    SELECT b.booking_code, c.full_name, cs.status, cs.electricity_share_paise,
      cs.electricity_deduct_from_deposit, vr.vacating_date::text, cs.updated_at
    FROM checkout_settlements cs
    JOIN bookings b ON b.id = cs.booking_id
    JOIN customers c ON c.id = cs.customer_id
    JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    JOIN beds bd ON bd.id = br.bed_id
    WHERE bd.room_id = ${roomId}::uuid
    ORDER BY cs.updated_at DESC
  `);
  console.log('\n=== CHECKOUT SETTLEMENTS (room 204) ===');
  console.table(settlements);

  const allContrib = await db.execute(sql`
    SELECT b.booking_code, c.full_name, erc.billing_month::text, erc.amount_paise, erc.kind
    FROM electricity_room_contributions erc
    JOIN customers c ON c.id = erc.customer_id
    JOIN bookings b ON b.id = erc.booking_id
    WHERE erc.room_id = ${roomId}::uuid
    ORDER BY erc.billing_month DESC
  `);
  console.log('\n=== ALL ROOM CONTRIBUTIONS ===');
  console.table(allContrib);

  const govindCs = await db.execute(sql`
    SELECT cs.*, b.booking_code
    FROM checkout_settlements cs
    JOIN bookings b ON b.id = cs.booking_id
    WHERE b.booking_code = 'APG-2026-0082'
    ORDER BY cs.updated_at DESC LIMIT 1
  `);
  console.log('\n=== GOVIND (0082) CHECKOUT ===');
  console.log(govindCs[0]);

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
