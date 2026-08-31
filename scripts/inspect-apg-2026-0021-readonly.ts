/**
 * Read-only inspect: APG-2026-0021 room change + deposit payment review.
 * Does not mutate financial records.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl();

const CODE = 'APG-2026-0021';

async function main() {
  const [booking] = await db.execute<{
    id: string;
    customer_id: string;
    status: string;
    subtotal_paise: number;
    deposit_paise: number;
    deposit_due_paise: number;
    deposit_collection_status: string;
    stay_type: string | null;
  }>(sql`
    SELECT id, customer_id, status,
      subtotal_paise::bigint::int, deposit_paise::bigint::int,
      deposit_due_paise::bigint::int, deposit_collection_status, stay_type
    FROM bookings WHERE booking_code = ${CODE} LIMIT 1
  `);
  if (!booking) throw new Error('not found');

  const rooms = await db.execute(sql`
    SELECT br.kind, br.status, br.stay_range::text AS stay_range,
      pg_typeof(br.stay_range)::text AS stay_range_pg_type,
      b.bed_code, r.room_number, rt.name AS room_type, rt.default_capacity
    FROM bed_reservations br
    JOIN beds b ON b.id = br.bed_id
    JOIN rooms r ON r.id = b.room_id
    JOIN room_types rt ON rt.id = r.room_type_id
    WHERE br.booking_id = ${booking.id}
    ORDER BY br.created_at
  `);

  const rcs = await db.execute(sql`
    SELECT rcr.id, rcr.status, rcr.requested_shift_date, rcr.expected_transfer_date,
      rcr.transfer_mode, rcr.completed_at::text,
      fb.bed_code AS from_bed, fr.room_number AS from_room, frt.default_capacity AS from_cap, frt.name AS from_type,
      tb.bed_code AS to_bed, tr.room_number AS to_room, trt.default_capacity AS to_cap, trt.name AS to_type,
      jsonb_build_object(
        'oldMonthlyRentPaise', rcr.quote_snapshot->'oldMonthlyRentPaise',
        'newMonthlyRentPaise', rcr.quote_snapshot->'newMonthlyRentPaise',
        'depositHeldPaise', rcr.quote_snapshot->'depositHeldPaise',
        'depositRequiredPaise', rcr.quote_snapshot->'depositRequiredPaise',
        'depositDeltaPaise', rcr.quote_snapshot->'depositDeltaPaise',
        'depositDuePaise', rcr.quote_snapshot->'depositDuePaise',
        'shiftFeePaise', rcr.quote_snapshot->'shiftFeePaise',
        'feeDuePaise', rcr.quote_snapshot->'feeDuePaise',
        'newRentChargePaise', rcr.quote_snapshot->'newRentChargePaise',
        'rentDeltaPaise', rcr.quote_snapshot->'rentDeltaPaise',
        'unusedPrepaidCreditPaise', rcr.quote_snapshot->'unusedPrepaidCreditPaise',
        'totalDuePaise', rcr.quote_snapshot->'totalDuePaise',
        'shiftDate', rcr.quote_snapshot->'shiftDate',
        'lines', rcr.quote_snapshot->'lines'
      ) AS quote_summary
    FROM room_change_requests rcr
    JOIN beds fb ON fb.id = rcr.from_bed_id
    JOIN rooms fr ON fr.id = fb.room_id
    JOIN room_types frt ON frt.id = fr.room_type_id
    JOIN beds tb ON tb.id = rcr.to_bed_id
    JOIN rooms tr ON tr.id = tb.room_id
    JOIN room_types trt ON trt.id = tr.room_type_id
    WHERE rcr.booking_id = ${booking.id}
    ORDER BY rcr.created_at
  `);

  const links = await db.execute(sql`
    SELECT id, purpose, status, amount::bigint::int AS amount_paise, title, description,
      booking_id, invoice_id,
      payment_proof_url IS NOT NULL AS has_screenshot,
      CASE
        WHEN payment_proof_transaction_ref IS NULL OR btrim(payment_proof_transaction_ref) = '' THEN 'empty'
        WHEN payment_proof_transaction_ref LIKE '%@%' THEN 'looks_like_upi_vpa'
        ELSE 'looks_like_txn_ref'
      END AS txn_ref_shape,
      length(coalesce(payment_proof_transaction_ref, '')) AS txn_ref_len,
      created_at::text
    FROM payment_links
    WHERE booking_id = ${booking.id} OR resident_id = ${booking.customer_id}
    ORDER BY created_at
  `);

  const fins = await db.execute(sql`
    SELECT id, invoice_number, source_table, source_id, status, invoice_type,
      amount_paise::bigint::int AS amount_paise, notes, created_at::text
    FROM financial_invoices
    WHERE booking_id = ${booking.id}
    ORDER BY created_at
  `);

  const ledger = await db.execute(sql`
    SELECT entry_kind, amount_paise::bigint::int AS amount_paise, reason,
      related_payment_id, created_at::text
    FROM deposit_ledger
    WHERE booking_id = ${booking.id}
    ORDER BY created_at
  `);

  const rents = await db.execute(sql`
    SELECT invoice_number, billing_month::text, status,
      rent_paise::bigint::int AS rent_paise,
      paid_principal_paise::bigint::int AS paid_principal_paise
    FROM rent_invoices
    WHERE booking_id = ${booking.id}
    ORDER BY billing_month
  `);

  const customer = await db.execute(sql`
    SELECT kyc_status FROM customers WHERE id = ${booking.customer_id} LIMIT 1
  `);

  console.log(JSON.stringify({ booking, rooms, rcs, links, fins, ledger, rents, customer }, null, 2));

  const audit = {
    A_booking: booking,
    B_invoices: { financial: fins, rent: rents },
    C_frozen_quote: (rcs as Array<{ quote_summary: unknown }>)[0]?.quote_summary ?? null,
    D_deposit_payment: (links as Array<{ id: string; purpose: string; status: string; amount_paise: number }>).find(
      (l) => l.purpose === 'deposit',
    ),
    E_bed_assignment: rooms,
    F_september_rent: (rents as Array<{ invoice_number: string; billing_month: string; status: string; rent_paise: number }>).find(
      (r) => r.billing_month?.startsWith('2026-09'),
    ),
    G_must_change_after_fix: [
      'Deposit link → paid after admin approve',
      'Deposit ledger +321140 once',
      'INV-2026-SHA-0004 → paid',
      'New-rent invoice ₹191 still payable until paid',
      'Room transfer after all charges settled',
      'September rent → ₹760000 after transfer + Sep 1 bed price',
    ],
    H_must_not_change: [
      'Frozen quote_snapshot amounts (31-Aug rates)',
      'Aug rent invoice paid ₹412080',
      'Historical deposit ₹400000 ledger row',
      'Deposit due ₹321140 on room-change quote',
    ],
  };
  console.log('\n--- AUDIT A–H ---\n', JSON.stringify(audit, null, 2));
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
