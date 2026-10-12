/* eslint-disable no-console */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

async function main() {
  loadProductionAuditEnv();
  requireDatabaseUrl('forensic-room201-deep.ts');

  const { db, closeDb } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');

  const roomId = 'dd469fbf-5eba-4ebc-b28b-d4f06ea3c8d1'; // Room 201

  console.log('=== ROOM 201 FORENSIC ANALYSIS ===\n');

  // 1. Room Details
  const room = await db.execute(sql`
    SELECT r.id, r.room_number, f.floor_number, p.name as pg_name, rt.name as room_type, rt.default_capacity
    FROM rooms r
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    JOIN room_types rt ON rt.id = r.room_type_id
    WHERE r.id = ${roomId}::uuid
  `);
  console.log('Room:', JSON.stringify(room, null, 2));

  // 2. Beds in Room 201
  const beds = await db.execute(sql`
    SELECT b.id, b.bed_code, b.status, b.manual_occupied, b.manual_reserved_start, b.manual_reserved_check_in, b.archived_at
    FROM beds b
    WHERE b.room_id = ${roomId}::uuid
    ORDER BY b.bed_code
  `);
  console.log('Beds in Room 201:', JSON.stringify(beds, null, 2));

  // 3. ALL Bed Reservations in Room 201 across all time
  const reservations = await db.execute(sql`
    SELECT br.id, br.booking_id, br.bed_id, b.bed_code, br.stay_range, br.kind, br.status,
           bk.booking_code, bk.status as booking_status, bk.expected_checkout_date,
           c.id as customer_id, c.full_name as customer_name, c.phone,
           br.created_at, br.updated_at
    FROM bed_reservations br
    JOIN beds b ON b.id = br.bed_id
    JOIN bookings bk ON bk.id = br.booking_id
    JOIN customers c ON c.id = bk.customer_id
    WHERE b.room_id = ${roomId}::uuid
    ORDER BY br.created_at ASC
  `);
  console.log('ALL Reservations in Room 201:', JSON.stringify(reservations, null, 2));

  // 4. ALL Electricity Bills for Room 201
  const bills = await db.execute(sql`
    SELECT eb.id, eb.billing_month, eb.period_start_date, eb.period_end_date,
           eb.previous_reading_units, eb.current_reading_units, eb.units_consumed,
           eb.rate_per_unit_paise, eb.total_paise, eb.bill_status, eb.is_estimated,
           eb.monthly_occupant_count, eb.per_resident_paise, eb.checkout_credit_applied_paise,
           eb.created_at, eb.updated_at
    FROM electricity_bills eb
    WHERE eb.room_id = ${roomId}::uuid
    ORDER BY eb.created_at ASC
  `);
  console.log('ALL Electricity Bills for Room 201:', JSON.stringify(bills, null, 2));

  // 5. Meter Logs for Room 201
  const logs = await db.execute(sql`
    SELECT ml.*
    FROM meter_logs ml
    WHERE ml.room_id = ${roomId}::uuid
    ORDER BY ml.recorded_at ASC, ml.created_at ASC
  `);
  console.log('ALL Meter Logs for Room 201:', JSON.stringify(logs, null, 2));

  // 6. Electricity Invoices for Room 201
  const invoices = await db.execute(sql`
    SELECT ei.id, ei.bill_id, ei.booking_id, ei.customer_id, c.full_name as customer_name,
           ei.billing_month, ei.units_consumed, ei.amount_paise, ei.paid_paise, ei.status,
           ei.created_at, ei.updated_at
    FROM electricity_invoices ei
    JOIN customers c ON c.id = ei.customer_id
    WHERE ei.bill_id IN (SELECT id FROM electricity_bills WHERE room_id = ${roomId}::uuid)
       OR ei.booking_id IN (
         SELECT br.booking_id FROM bed_reservations br
         JOIN beds b ON b.id = br.bed_id
         WHERE b.room_id = ${roomId}::uuid
       )
    ORDER BY ei.created_at ASC
  `);
  console.log('ALL Electricity Invoices for Room 201 / Occupants:', JSON.stringify(invoices, null, 2));

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
