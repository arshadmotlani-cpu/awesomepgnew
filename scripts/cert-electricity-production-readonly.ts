#!/usr/bin/env npx tsx
/**
 * READ-ONLY production electricity certification report helper.
 * Mutation count: 0
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('cert-electricity-production');

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { previewElectricityBillAllocation } from '@/src/services/repairElectricityBillAllocation';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { loadRoomElectricityContributionsForMonth } from '@/src/services/electricityRoomContributions';
import { paiseToInr } from '@/src/lib/format';

async function main() {
  console.log('=== PRODUCTION ELECTRICITY CERT (READ-ONLY) ===\n');

  const ledgerMissing = await db.execute(sql`
    SELECT esl.id::text, esl.room_id::text, esl.billing_month::text, esl.customer_id::text,
           esl.amount_paise::int, esl.checkout_settlement_id::text, c.full_name,
           r.room_number, p.name AS pg_name
    FROM electricity_settlement_ledger esl
    INNER JOIN customers c ON c.id = esl.customer_id
    INNER JOIN rooms r ON r.id = esl.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE esl.amount_paise > 0
      AND NOT EXISTS (
        SELECT 1 FROM electricity_room_contributions erc
        WHERE erc.checkout_settlement_id = esl.checkout_settlement_id
      )
  `);
  console.log('1. Ledger rows missing contribution:', ledgerMissing.length);
  console.log(JSON.stringify(ledgerMissing, null, 2));

  const settlementNoRecord = await db.execute(sql`
    SELECT cs.id::text, cs.electricity_share_paise::int, cs.status, vr.vacating_date::text,
           c.full_name, r.room_number, p.name AS pg_name
    FROM checkout_settlements cs
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    INNER JOIN customers c ON c.id = cs.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = cs.booking_id AND br.kind = 'primary'
    INNER JOIN beds b ON b.id = br.bed_id
    INNER JOIN rooms r ON r.id = b.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE cs.electricity_share_paise > 0
      AND cs.status IN ('approved', 'refund_pending', 'completed', 'refund_paid')
      AND NOT EXISTS (SELECT 1 FROM electricity_room_contributions erc WHERE erc.checkout_settlement_id = cs.id)
      AND NOT EXISTS (SELECT 1 FROM electricity_settlement_ledger esl WHERE esl.checkout_settlement_id = cs.id AND esl.amount_paise > 0)
  `);
  console.log('\n2. Approved settlements with electricity but no collection record:', settlementNoRecord.length);
  console.log(JSON.stringify(settlementNoRecord, null, 2));

  const contributorUnpaid = await db.execute(sql`
    SELECT erc.room_id::text, erc.billing_month::text, erc.customer_id::text, c.full_name,
           erc.amount_paise::int AS contribution_paise, ei.id::text AS invoice_id,
           ei.amount_paise::int AS invoice_paise, ei.status
    FROM electricity_room_contributions erc
    INNER JOIN electricity_invoices ei
      ON ei.customer_id = erc.customer_id AND ei.room_id = erc.room_id AND ei.billing_month = erc.billing_month
    INNER JOIN customers c ON c.id = erc.customer_id
    WHERE erc.amount_paise > 0 AND ei.status NOT IN ('cancelled','paid')
      AND ei.amount_paise > 0 AND ei.is_pipeline_test = false
  `);
  console.log('\n3. Contributor with non-zero unpaid invoice:', contributorUnpaid.length);

  const sepBills = await db.execute(sql`
    SELECT eb.id::text, eb.billing_month::text, eb.created_at::text, eb.total_paise::int,
           eb.checkout_credit_applied_paise::int, r.room_number, p.name AS pg_name,
           eb.previous_reading_units::text, eb.current_reading_units::text
    FROM electricity_bills eb
    INNER JOIN rooms r ON r.id = eb.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE eb.is_pipeline_test = false
      AND (eb.billing_month = '2026-09-01' OR eb.created_at >= '2026-09-01')
    ORDER BY eb.billing_month, r.room_number
  `);
  console.log('\n4. Bills with billing_month=Sep OR created in Sep:', sepBills.length);
  console.log(JSON.stringify(sepBills, null, 2));

  const repairDetails: unknown[] = [];
  const billIds = await db.execute<{ id: string }>(sql`
    SELECT id::text FROM electricity_bills WHERE is_pipeline_test = false ORDER BY billing_month
  `);
  let needsRepair = 0;
  for (const { id } of billIds) {
    const preview = await previewElectricityBillAllocation(id);
    if (!preview || preview.plan.kind === 'noop') continue;
    needsRepair += 1;
    repairDetails.push({
      pg: preview.pgName,
      room: preview.roomNumber,
      billingMonth: preview.billingMonth,
      roomTotalPaise: preview.roomTotalPaise,
      planKind: preview.plan.kind,
      planOk: preview.plan.ok,
      reasons: preview.plan.ok ? [] : preview.plan.reasons,
      historicalResidents: preview.historicalResidents,
      existingInvoices: preview.existingInvoices.map((i) => ({
        customerId: i.customerId,
        amountPaise: i.amountPaise,
        paidPaise: i.paidPaise,
        status: i.status,
      })),
    });
  }
  console.log(`\n5. Allocation repair: scanned=${billIds.length} needsRepair=${needsRepair}`);
  console.log(JSON.stringify(repairDetails, null, 2));

  const checkoutCases = await db.execute(sql`
    SELECT erc.id::text, erc.room_id::text, erc.billing_month::text, erc.amount_paise::int,
           erc.kind, c.full_name, r.room_number, p.name AS pg_name,
           eb.id::text AS bill_id, eb.total_paise::int AS bill_total,
           eb.checkout_credit_applied_paise::int AS checkout_credit,
           ei.amount_paise::int AS invoice_paise, ei.status AS invoice_status
    FROM electricity_room_contributions erc
    INNER JOIN customers c ON c.id = erc.customer_id
    INNER JOIN rooms r ON r.id = erc.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    LEFT JOIN electricity_bills eb ON eb.room_id = erc.room_id AND eb.billing_month = erc.billing_month AND eb.is_pipeline_test = false
    LEFT JOIN electricity_invoices ei ON ei.electricity_bill_id = eb.id AND ei.customer_id = erc.customer_id AND ei.status <> 'cancelled'
    WHERE erc.kind = 'checkout_recovery' AND erc.amount_paise > 0
    ORDER BY erc.billing_month DESC, r.room_number
    LIMIT 20
  `);
  console.log('\n6. Checkout recovery contributions (sample):');
  console.log(JSON.stringify(checkoutCases, null, 2));

  const room204Aug = await db.execute(sql`
    SELECT eb.id::text, eb.billing_month::text, eb.total_paise::int,
           eb.checkout_credit_applied_paise::int, r.room_number
    FROM electricity_bills eb
    INNER JOIN rooms r ON r.id = eb.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE p.name ILIKE '%shantinagar%' AND r.room_number = '204'
      AND eb.billing_month IN ('2026-07-01','2026-08-01','2026-09-01')
      AND eb.is_pipeline_test = false
    ORDER BY eb.billing_month
  `);
  console.log('\n7. Room 204 Shantinagar bills Jul-Sep:');
  console.log(JSON.stringify(room204Aug, null, 2));

  const room204Id = await db.execute<{ room_id: string }>(sql`
    SELECT r.id::text AS room_id FROM rooms r
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE p.name ILIKE '%shantinagar%' AND r.room_number = '204' LIMIT 1
  `);
  const rid = room204Id[0]?.room_id;
  if (rid) {
    for (const month of ['2026-07-01', '2026-08-01', '2026-09-01']) {
      const occ = await loadRoomElectricityOccupantsForMonth({ roomId: rid, billingMonth: month, includeFixedStay: true, useProRataByActiveDays: true });
      const contrib = await loadRoomElectricityContributionsForMonth(rid, month);
      console.log(`\n8. Room 204 ${month} occupants=${occ.occupants.length} contributions=${contrib.totalPaise} (${paiseToInr(contrib.totalPaise)})`);
      for (const o of occ.occupants) {
        const collected = contrib.byCustomerId.get(o.customerId) ?? 0;
        console.log(`   ${o.customerName}: ${o.occupiedDates?.length ?? 0} days, prior collected ${paiseToInr(collected)}`);
      }
    }
  }

  const bedChanges = await db.execute(sql`
    SELECT rcr.id::text, rcr.booking_id::text, c.full_name,
           r_from.room_number AS from_room, b_from.bed_code AS from_bed,
           r_to.room_number AS to_room, b_to.bed_code AS to_bed,
           rcr.transfer_date::text, rcr.status
    FROM room_change_requests rcr
    INNER JOIN bookings bk ON bk.id = rcr.booking_id
    INNER JOIN customers c ON c.id = bk.customer_id
    INNER JOIN beds b_from ON b_from.id = rcr.from_bed_id
    INNER JOIN rooms r_from ON r_from.id = b_from.room_id
    INNER JOIN beds b_to ON b_to.id = rcr.to_bed_id
    INNER JOIN rooms r_to ON r_to.id = b_to.room_id
    WHERE rcr.status = 'completed' AND r_from.id = r_to.id
    ORDER BY rcr.transfer_date DESC LIMIT 5
  `);
  console.log('\n9. Same-room bed changes (sample):');
  console.log(JSON.stringify(bedChanges, null, 2));

  const crossRoom = await db.execute(sql`
    SELECT rcr.id::text, c.full_name, r_from.room_number AS from_room, r_to.room_number AS to_room,
           rcr.transfer_date::text
    FROM room_change_requests rcr
    INNER JOIN bookings bk ON bk.id = rcr.booking_id
    INNER JOIN customers c ON c.id = bk.customer_id
    INNER JOIN beds b_from ON b_from.id = rcr.from_bed_id
    INNER JOIN rooms r_from ON r_from.id = b_from.room_id
    INNER JOIN beds b_to ON b_to.id = rcr.to_bed_id
    INNER JOIN rooms r_to ON r_to.id = b_to.room_id
    WHERE rcr.status = 'completed' AND r_from.id <> r_to.id
    ORDER BY rcr.transfer_date DESC LIMIT 5
  `);
  console.log('\n10. Cross-room transfers (sample):');
  console.log(JSON.stringify(crossRoom, null, 2));

  const idempotency = await db.execute(sql`
    SELECT room_id::text, billing_month::text, count(*)::int AS bill_count
    FROM electricity_bills WHERE is_pipeline_test = false
    GROUP BY room_id, billing_month HAVING count(*) > 1
  `);
  console.log('\n11. Duplicate room+month bills:', idempotency.length);

  console.log('\n=== MUTATION COUNT: 0 ===');
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
