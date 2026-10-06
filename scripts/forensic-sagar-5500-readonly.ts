/* eslint-disable no-console */
/**
 * Read-only: trace Sagar ₹5,500 payment and room-change rent credit.
 * USE_PRODUCTION_DB=1 npx tsx scripts/forensic-sagar-5500-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('forensic-sagar-5500');

import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bookings, payments, residentCreditLedger } from '../src/db/schema';
import { paiseToInr } from '../src/lib/format';
import {
  applyRoomShiftCreditWaterfall,
  settleRoomShiftRentSides,
} from '../src/services/roomShiftQuote';

const CODE = 'APG-2026-0112';

async function main() {
  const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, CODE)).limit(1);
  if (!bk) throw new Error('booking not found');

  console.log('\n=== BOOKING ===');
  console.log({
    id: bk.id,
    code: bk.bookingCode,
    depositPaise: bk.depositPaise,
    depositDuePaise: bk.depositDuePaise,
    subtotalPaise: bk.subtotalPaise,
    checkIn: bk.billingAnchorDate,
  });

  console.log('\n=== PAYMENTS (booking, amount >= ₹5000) ===');
  const pays = await db.execute(sql`
    SELECT p.id::text, p.amount_paise, p.status, p.purpose, p.provider,
           p.provider_payment_id, p.provider_order_id, p.paid_at::text, p.created_at::text,
           p.raw_payload
    FROM payments p
    WHERE p.booking_id = ${bk.id}::uuid
      AND p.amount_paise >= 500000
    ORDER BY coalesce(p.paid_at, p.created_at)
  `);
  for (const p of pays) console.log(JSON.stringify(p));

  console.log('\n=== ALL PAYMENTS (booking) ===');
  const allPays = await db.execute(sql`
    SELECT p.id::text, p.amount_paise, p.status, p.purpose, p.provider, p.paid_at::text,
           p.provider_payment_id
    FROM payments p WHERE p.booking_id = ${bk.id}::uuid
    ORDER BY coalesce(p.paid_at, p.created_at)
  `);
  for (const p of allPays) {
    console.log(
      `${p.paid_at ?? p.created_at} ${paiseToInr(Number(p.amount_paise))} ${p.status} ${p.purpose} ${p.provider} ${p.id}`,
    );
  }

  console.log('\n=== PAYMENT → INVOICE ALLOCATION ===');
  const alloc = await db.execute(sql`
    SELECT p.id::text AS payment_id, p.amount_paise AS payment_amount,
           p.paid_at::text, fi.id::text AS fi_id, fi.invoice_number, fi.source_table,
           fi.amount_paise AS invoice_amount, fi.status AS invoice_status,
           fi.breakdown, fi.notes, fi.paid_at::text AS invoice_paid_at
    FROM payments p
    LEFT JOIN financial_invoices fi ON fi.payment_id = p.id
    WHERE p.booking_id = ${bk.id}::uuid
    ORDER BY coalesce(p.paid_at, p.created_at), fi.invoice_number
  `);
  for (const a of alloc) console.log(JSON.stringify(a));

  console.log('\n=== ROOM CHANGE REQUESTS (full) ===');
  const rcrs = await db.execute(sql`
    SELECT id::text, workflow_state, status, requested_shift_date::text,
           from_bed_id::text, to_bed_id::text, quote_snapshot, completed_at::text,
           created_at::text, held_at::text
    FROM room_change_requests
    WHERE booking_id = ${bk.id}::uuid
    ORDER BY created_at
  `);
  for (const r of rcrs) {
    const snap = r.quote_snapshot as Record<string, unknown> | null;
    console.log('\n--- RCR', r.id, r.workflow_state, r.status, 'shift', r.requested_shift_date);
    console.log('completed', r.completed_at, 'created', r.created_at);
    if (snap) {
      console.log(
        JSON.stringify(
          {
            shiftDate: snap.shiftDate,
            oldMonthlyRentPaise: snap.oldMonthlyRentPaise,
            newMonthlyRentPaise: snap.newMonthlyRentPaise,
            currentMonthRentIsPaid: snap.currentMonthRentIsPaid,
            unusedPrepaidCreditPaise: snap.unusedPrepaidCreditPaise,
            unusedRentCreditPaise: snap.unusedRentCreditPaise,
            newRentChargePaise: snap.newRentChargePaise,
            walletSurplusPaise: snap.walletSurplusPaise,
            totalDuePaise: snap.totalDuePaise,
            depositDuePaise: snap.depositDuePaise,
            newRentDuePaise: snap.newRentDuePaise,
            oldRentDueAfterCreditPaise: snap.oldRentDueAfterCreditPaise,
            feeDuePaise: snap.feeDuePaise,
            creditAppliedPaise: snap.creditAppliedPaise,
            fromRoomLabel: snap.fromRoomLabel,
            toRoomLabel: snap.toRoomLabel ?? snap.toRoomNumber,
            invoiceIds: snap.invoiceIds,
          },
          null,
          2,
        ),
      );
    }
  }

  console.log('\n=== FINANCIAL INVOICES (room change sources) ===');
  const fis = await db.execute(sql`
    SELECT fi.id::text, fi.invoice_number, fi.source_table, fi.source_id::text,
           fi.amount_paise, fi.status, fi.breakdown, fi.notes, fi.paid_at::text,
           fi.payment_id::text, fi.created_at::text
    FROM financial_invoices fi
    WHERE fi.booking_id = ${bk.id}::uuid
      AND fi.source_table LIKE 'room_change%'
    ORDER BY fi.created_at
  `);
  for (const fi of fis) console.log(JSON.stringify(fi));

  console.log('\n=== RESIDENT CREDIT LEDGER (all customer) ===');
  const credits = await db
    .select()
    .from(residentCreditLedger)
    .where(eq(residentCreditLedger.customerId, bk.customerId));
  for (const c of credits) {
    console.log({
      id: c.id,
      kind: c.entryKind,
      amount: c.amountPaise,
      inr: paiseToInr(c.amountPaise),
      reason: c.reason,
      bookingId: c.bookingId,
      createdAt: c.createdAt?.toISOString(),
    });
  }

  console.log('\n=== CREDIT APPLICATIONS (negative / apply) ===');
  const applies = credits.filter(
    (c) =>
      c.entryKind === 'applied' ||
      (c.reason && c.reason.includes('room_change_credit_apply')),
  );
  for (const c of applies) console.log(c);

  console.log('\n=== BED PRICES (Sagar bed history via reservations) ===');
  const bedPrices = await db.execute(sql`
    SELECT bp.effective_from::text, bp.monthly_rate_paise, bp.monthly_security_deposit_paise,
           b.bed_code, r.room_number
    FROM bed_prices bp
    INNER JOIN beds b ON b.id = bp.bed_id
    INNER JOIN rooms r ON r.id = b.room_id
    WHERE bp.bed_id IN (
      SELECT DISTINCT br.bed_id FROM bed_reservations br WHERE br.booking_id = ${bk.id}::uuid
    )
    ORDER BY bp.effective_from, b.bed_code
  `);
  for (const p of bedPrices) console.log(p);

  console.log('\n=== ROOM 203 CONFIG / SHARING TIMELINE ===');
  const room203 = await db.execute(sql`
    SELECT s.effective_from::text, s.target_bed_count, s.monthly_rate_paise, s.monthly_deposit_paise,
           s.status, s.applied_at::text
    FROM room_configuration_schedules s
    INNER JOIN rooms r ON r.id = s.room_id
    WHERE r.room_number = '203'
    ORDER BY s.effective_from
  `);
  for (const s of room203) console.log(s);

  console.log('\n=== RENT INVOICES (chronological) ===');
  const rent = await db.execute(sql`
    SELECT invoice_number, billing_month::text, invoice_subtype, is_adhoc,
           rent_paise, paid_principal_paise, status, notes, paid_at::text, created_at::text
    FROM rent_invoices WHERE booking_id = ${bk.id}::uuid
    ORDER BY billing_month, created_at
  `);
  for (const r of rent) console.log(JSON.stringify(r));

  // Recompute surplus for request 70dd0a1d if present
  const targetId = '70dd0a1d-e381-4180-8e59-5c27c57a1651';
  const target = rcrs.find((r) => r.id === targetId);
  if (target?.quote_snapshot) {
    const q = target.quote_snapshot as {
      shiftDate: string;
      oldMonthlyRentPaise: number;
      newMonthlyRentPaise: number;
      currentMonthRentIsPaid: boolean;
      newRentChargePaise: number;
      depositDeltaPaise: number;
      shiftFeePaise: number;
    };
    const sides = settleRoomShiftRentSides({
      oldMonthlyRentPaise: q.oldMonthlyRentPaise,
      newMonthlyRentPaise: q.newMonthlyRentPaise,
      shiftDate: q.shiftDate,
      currentMonthRentIsPaid: q.currentMonthRentIsPaid,
    });
    const waterfall = applyRoomShiftCreditWaterfall({
      oldRentDuePaise: sides.oldRentDuePaise,
      newRentChargePaise: q.newRentChargePaise,
      shiftFeePaise: q.shiftFeePaise ?? 9000,
      depositTopUpPaise: Math.max(0, q.depositDeltaPaise ?? 0),
      unusedPrepaidCreditPaise: sides.unusedPrepaidCreditPaise,
    });
    console.log('\n=== RECOMPUTE QUOTE MATH (RCR', targetId, ') ===');
    console.log({ sides, waterfall, recordedSurplus: (target.quote_snapshot as { walletSurplusPaise: number }).walletSurplusPaise });
  }

  console.log('\n=== BED RESERVATIONS (timeline) ===');
  const br = await db.execute(sql`
    SELECT br.kind, br.status, lower(br.stay_range)::text AS stay_from,
           upper(br.stay_range)::text AS stay_to, b.bed_code, r.room_number, br.created_at::text
    FROM bed_reservations br
    INNER JOIN beds b ON b.id = br.bed_id
    INNER JOIN rooms r ON r.id = b.room_id
    WHERE br.booking_id = ${bk.id}::uuid
    ORDER BY lower(br.stay_range), br.created_at
  `);
  for (const r of br) console.log(r);

  console.log('\n=== BOOKING PRICING SNAPSHOT ===');
  const snap = bk.pricingSnapshot as {
    perBed?: Array<{ bedId?: string; monthlyRatePaise?: number; bedCode?: string }>;
  } | null;
  console.log(JSON.stringify(snap?.perBed ?? null, null, 2));

  const { loadBedPrice } = await import('../src/services/pricing');
  const rcrRow = rcrs.find((r) => r.id === '70dd0a1d-e381-4180-8e59-5c27c57a1651');
  if (rcrRow?.from_bed_id) {
    for (const d of ['2026-10-01', '2026-10-03']) {
      const p = await loadBedPrice(String(rcrRow.from_bed_id), d);
      console.log('loadBedPrice old bed', d, p);
    }
  }
  if (rcrRow?.to_bed_id) {
    const p = await loadBedPrice(String(rcrRow.to_bed_id), '2026-10-03');
    console.log('loadBedPrice new bed 2026-10-03', p);
  }

  console.log('\n=== DEPOSIT LEDGER ===');
  const dledger = await db.execute(sql`
    SELECT entry_kind, amount_paise, reason, created_at::text FROM deposit_ledger
    WHERE booking_id = ${bk.id}::uuid ORDER BY created_at
  `);
  for (const d of dledger) console.log(d);

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
