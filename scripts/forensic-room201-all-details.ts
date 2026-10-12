/* eslint-disable no-console */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

async function main() {
  loadProductionAuditEnv();
  requireDatabaseUrl('forensic-room201-all-details.ts');

  const { db, closeDb } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');

  const roomId = 'dd469fbf-5eba-4ebc-b28b-d4f06ea3c8d1'; // Room 201
  const dhairyaCustomerId = '59f10adc-8e67-45ef-9dab-d8fd3aa16ede';
  const dhairyaBookingId = 'e64f5bf4-b15a-46b0-93cd-9b4ea83fc183';

  console.log('=== ROOM 201 DEEP INVESTIGATION ===\n');

  // 1. Electricity Invoices
  const invoices = await db.execute(sql`
    SELECT ei.id, ei.invoice_number, ei.electricity_bill_id, ei.booking_id, ei.customer_id,
           c.full_name as customer_name, ei.billing_month, ei.amount_paise, ei.paid_paise,
           ei.status, ei.created_at, ei.updated_at
    FROM electricity_invoices ei
    JOIN customers c ON c.id = ei.customer_id
    WHERE ei.room_id = ${roomId}::uuid
       OR ei.booking_id = ${dhairyaBookingId}::uuid
    ORDER BY ei.created_at ASC
  `);
  console.log('1. Electricity Invoices for Room 201 / Dhairya:\n', JSON.stringify(invoices, null, 2));

  // 2. Payments related to electricity invoices or Dhairya
  const payments = await db.execute(sql`
    SELECT p.id, p.booking_id, p.amount_paise, p.purpose, p.provider, p.status,
           p.paid_at, p.created_at, p.updated_at
    FROM payments p
    WHERE p.booking_id = ${dhairyaBookingId}::uuid
       OR p.id IN (SELECT payment_id FROM electricity_invoices WHERE room_id = ${roomId}::uuid AND payment_id IS NOT NULL)
    ORDER BY p.created_at ASC
  `);
  console.log('\n2. Payments for Dhairya / Room 201 Electricity:\n', JSON.stringify(payments, null, 2));

  // 3. Electricity Ledger / Contributions for Room 201
  const ledger = await db.execute(sql`
    SELECT esl.*
    FROM electricity_settlement_ledger esl
    WHERE esl.room_id = ${roomId}::uuid
  `);
  console.log('\n3. Electricity Settlement Ledger Rows:\n', JSON.stringify(ledger, null, 2));

  // 4. Audit Log involving Room 201, Dhairya, or electricity
  const audit = await db.execute(sql`
    SELECT al.id, al.actor_type, al.actor_id, al.entity, al.entity_id, al.action,
           al.diff, al.created_at
    FROM audit_log al
    WHERE al.entity_id = ${roomId}::uuid
       OR al.entity_id = ${dhairyaCustomerId}::uuid
       OR al.entity_id = ${dhairyaBookingId}::uuid
       OR al.entity IN ('electricity_bill', 'meter_reading', 'meter_log', 'checkout_settlement')
    ORDER BY al.created_at DESC
    LIMIT 40
  `);
  console.log('\n4. Audit Logs:\n', JSON.stringify(audit, null, 2));

  // 5. Look at the calculation_breakdown of the two bills
  const billBreakdown = await db.execute(sql`
    SELECT id, billing_month, previous_reading_units, current_reading_units, units_consumed,
           rate_per_unit_paise, total_paise, calculation_breakdown, bill_status, notes, created_at
    FROM electricity_bills
    WHERE room_id = ${roomId}::uuid
    ORDER BY billing_month ASC
  `);
  console.log('\n5. Electricity Bills Detail (Breakdown & Notes):\n', JSON.stringify(billBreakdown, null, 2));

  // 6. Check checkout_settlements for Dhairya in detail
  const settlementDetail = await db.execute(sql`
    SELECT cs.id, cs.booking_id, cs.status, cs.electricity_previous_reading,
           cs.electricity_current_reading, cs.electricity_units, cs.electricity_unit_rate_paise,
           cs.electricity_share_paise, cs.electricity_deduct_from_deposit,
           cs.electricity_calculation_method, cs.created_at, cs.approved_at, cs.refund_paid_at,
           cs.deductions_snapshot, cs.settlement_waterfall_json
    FROM checkout_settlements cs
    WHERE cs.booking_id = ${dhairyaBookingId}::uuid
  `);
  console.log('\n6. Checkout Settlement Detail:\n', JSON.stringify(settlementDetail, null, 2));

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
