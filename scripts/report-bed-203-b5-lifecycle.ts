#!/usr/bin/env npx tsx
/**
 * Structured lifecycle report: Shanti Nagar · Room 203 · Bed B5 (Harish).
 * Outputs JSON for admin debugging + simulates old vs new vacating list queries.
 *
 * Usage:
 *   DATABASE_URL='…' npx tsx scripts/report-bed-203-b5-lifecycle.ts
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';

const PHONE = '6369363982';

async function main() {
  const rows = await db.execute<Record<string, unknown>>(sql`
    WITH target_bed AS (
      SELECT b.id AS bed_id, p.name AS pg_name, r.room_number, b.bed_code
      FROM beds b
      JOIN rooms r ON r.id = b.room_id
      JOIN floors f ON f.id = r.floor_id
      JOIN pgs p ON p.id = f.pg_id
      WHERE p.name ILIKE '%shanti%' AND r.room_number = '203' AND b.bed_code ILIKE '%B5%'
      LIMIT 1
    )
    SELECT
      c.id AS customer_id,
      c.full_name,
      c.phone,
      bk.id AS booking_id,
      bk.booking_code,
      bk.status AS booking_status,
      bk.created_at AS booking_created,
      br.id AS reservation_id,
      br.kind AS reservation_kind,
      br.status AS reservation_status,
      lower(br.stay_range)::date AS stay_from,
      upper(br.stay_range)::date AS stay_to,
      (CURRENT_DATE <@ br.stay_range AND br.status IN ('hold','active')) AS active_stay_today,
      vr.id AS vacating_id,
      vr.status AS vacating_status,
      vr.notice_given_date::text AS notice_given,
      vr.vacating_date::text AS vacating_date,
      vr.created_at AS vacating_created,
      vr.updated_at AS vacating_updated,
      cs.id AS settlement_id,
      cs.status AS settlement_status,
      cs.created_at AS settlement_created,
      cs.updated_at AS settlement_updated,
      (SELECT count(*)::int FROM resident_requests rr
       WHERE rr.booking_id = bk.id AND rr.type = 'deposit_refund'
         AND rr.status IN ('submitted','under_review','approved')) AS open_refund_requests,
      (SELECT coalesce(sum(dl.amount_paise),0)::bigint FROM deposit_ledger dl WHERE dl.booking_id = bk.id) AS ledger_net_paise,
      tb.pg_name,
      tb.room_number,
      tb.bed_code
    FROM customers c
    JOIN bookings bk ON bk.customer_id = c.id
    CROSS JOIN target_bed tb
    LEFT JOIN bed_reservations br ON br.booking_id = bk.id AND br.bed_id = tb.bed_id
    LEFT JOIN vacating_requests vr ON vr.booking_id = bk.id
    LEFT JOIN checkout_settlements cs ON cs.vacating_request_id = vr.id
    WHERE c.phone ILIKE ${'%' + PHONE + '%'}
       OR br.bed_id = tb.bed_id
    ORDER BY bk.created_at ASC, br.created_at ASC NULLS LAST
  `);

  const actionItems = await db.execute(sql`
    SELECT id, type, status, source_key, title, metadata, created_at, updated_at
    FROM action_items
    WHERE metadata->>'bookingId' IN (
      SELECT bk.id::text FROM bookings bk
      JOIN customers c ON c.id = bk.customer_id
      WHERE c.phone ILIKE ${'%' + PHONE + '%'}
    )
       OR title ILIKE '%Harish%'
    ORDER BY updated_at DESC
  `);

  const oldInnerJoin = await db.execute(sql`
    SELECT vr.id AS vacating_id, bk.booking_code
    FROM vacating_requests vr
    INNER JOIN bookings bk ON bk.id = vr.booking_id
    INNER JOIN customers c ON c.id = vr.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = bk.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE c.phone ILIKE ${'%' + PHONE + '%'}
  `);

  const newLateral = await db.execute(sql`
    SELECT vr.id AS vacating_id, bk.booking_code, loc.bed_code
    FROM vacating_requests vr
    INNER JOIN bookings bk ON bk.id = vr.booking_id
    INNER JOIN customers c ON c.id = vr.customer_id
    LEFT JOIN LATERAL (
      SELECT bd.bed_code, r.room_number, p.name AS pg_name
      FROM bed_reservations br
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN rooms r ON r.id = bd.room_id
      INNER JOIN floors f ON f.id = r.floor_id
      INNER JOIN pgs p ON p.id = f.pg_id
      WHERE br.booking_id = vr.booking_id AND br.kind = 'primary'
      ORDER BY br.created_at DESC
      LIMIT 1
    ) loc ON true
    WHERE c.phone ILIKE ${'%' + PHONE + '%'}
  `);

  const report = {
    asOf: new Date().toISOString(),
    target: { pg: 'Shanti Nagar', room: '203', bed: 'B5', phone: '+91' + PHONE },
    lifecycleRows: rows,
    actionItems,
    querySimulation: {
      oldInnerJoinVacatingVisible: oldInnerJoin,
      newLateralVacatingVisible: newLateral,
      vacatingDroppedByOldQuery:
        newLateral.length > oldInnerJoin.length,
    },
    workflowInference: inferWorkflow(rows),
  };

  console.log(JSON.stringify(report, null, 2));
  await closeDb();
}

function inferWorkflow(rows: Record<string, unknown>[]) {
  const bookings = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const code = r.booking_code as string;
    if (!bookings.has(code)) bookings.set(code, r);
  }

  const stages: Array<{
    bookingCode: string;
    moveOut: string;
    checkout: string;
    refund: string;
    bed: string;
    causesAdminVacatingCrash: string[];
    causesRefundCountMismatch: string[];
    causesCheckoutPendingInconsistency: string[];
  }> = [];

  for (const [code, r] of bookings) {
    const causesCrash: string[] = [];
    const causesRefundMismatch: string[] = [];
    const causesCheckout: string[] = [];

    const ledgerNet = Number(r.ledger_net_paise ?? 0);
    if (ledgerNet > 150000 || ledgerNet < 0) {
      causesCrash.push(`Corrupt deposit_ledger net ${ledgerNet} paise may throw deposit summary`);
    }
    if (r.vacating_status === 'approved' && !r.settlement_id) {
      causesCheckout.push('Approved vacating without checkout_settlement row');
    }
    if (Number(r.open_refund_requests) === 0 && r.settlement_status) {
      causesRefundMismatch.push(
        'Refund visible via checkout_settlement but no resident_requests.deposit_refund row',
      );
    }
    if (r.vacating_status === 'approved' && r.reservation_status && r.reservation_status !== 'active') {
      causesCrash.push(
        `Primary reservation ${r.reservation_status} — old INNER JOIN hid vacating from /admin/vacating`,
      );
      causesCheckout.push('Ops shows checkout via settlement; vacating page hid row');
    }

    stages.push({
      bookingCode: code,
      moveOut: String(r.vacating_status ?? 'none'),
      checkout: String(r.settlement_status ?? 'none'),
      refund:
        Number(r.open_refund_requests) > 0
          ? 'legacy resident_request open'
          : r.settlement_status
            ? `checkout: ${r.settlement_status}`
            : 'none',
      bed: r.active_stay_today
        ? `active ${r.stay_from} → ${r.stay_to}`
        : String(r.reservation_status ?? 'no primary on B5'),
      causesAdminVacatingCrash: causesCrash,
      causesRefundCountMismatch: causesRefundMismatch,
      causesCheckoutPendingInconsistency: causesCheckout,
    });
  }

  return stages;
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
