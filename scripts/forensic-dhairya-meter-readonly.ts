/* eslint-disable no-console */
/**
 * READ-ONLY FORENSIC INVESTIGATION:
 * Resident Dhairya/Dhariya, room, bed, meter readings, bills, settlements, ledger.
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

async function main() {
  loadProductionAuditEnv();
  requireDatabaseUrl('forensic-dhairya-meter-readonly.ts');

  const { db, closeDb } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');

  console.log('=== 1. FIND RESIDENT: DHAIRYA / DHARIYA ===\n');

  const customers = await db.execute(sql`
    SELECT c.id, c.full_name, c.phone, c.email, c.residency_status, c.created_at
    FROM customers c
    WHERE c.full_name ILIKE '%dhair%' OR c.full_name ILIKE '%dhari%'
  `);
  console.log('Customers found:', JSON.stringify(customers, null, 2));

  if (!Array.isArray(customers) || customers.length === 0) {
    // Try broader search
    const allMatches = await db.execute(sql`
      SELECT c.id, c.full_name, c.phone, c.email
      FROM customers c
      WHERE c.full_name ILIKE '%dh%'
      LIMIT 20
    `);
    console.log('Broader customers matching "dh":', JSON.stringify(allMatches, null, 2));
  }

  const customerIds = (customers as any[]).map((c) => c.id);

  if (customerIds.length > 0) {
    const bookings = await db.execute(sql`
      SELECT b.id as booking_id, b.booking_code, b.customer_id, b.status as booking_status,
             b.duration_mode, b.expected_checkout_date, b.created_at, b.pricing_snapshot
      FROM bookings b
      WHERE b.customer_id = ANY(${sql.raw(`'{${customerIds.join(',')}}'::uuid[]`)})
      ORDER BY b.created_at DESC
    `);
    console.log('\nBookings:', JSON.stringify(bookings, null, 2));

    const bookingIds = (bookings as any[]).map((b) => b.booking_id);

    if (bookingIds.length > 0) {
      const reservations = await db.execute(sql`
        SELECT br.id as reservation_id, br.booking_id, br.bed_id, br.stay_range, br.kind, br.status as res_status,
               b.bed_code, r.id as room_id, r.room_number, p.id as pg_id, p.name as pg_name
        FROM bed_reservations br
        JOIN beds b ON b.id = br.bed_id
        JOIN rooms r ON r.id = b.room_id
        JOIN floors f ON f.id = r.floor_id
        JOIN pgs p ON p.id = f.pg_id
        WHERE br.booking_id = ANY(${sql.raw(`'{${bookingIds.join(',')}}'::uuid[]`)})
        ORDER BY br.created_at ASC
      `);
      console.log('\nBed Reservations:', JSON.stringify(reservations, null, 2));

      const vacating = await db.execute(sql`
        SELECT vr.*
        FROM vacating_requests vr
        WHERE vr.booking_id = ANY(${sql.raw(`'{${bookingIds.join(',')}}'::uuid[]`)})
      `);
      console.log('\nVacating Requests:', JSON.stringify(vacating, null, 2));

      const settlements = await db.execute(sql`
        SELECT cs.*
        FROM checkout_settlements cs
        WHERE cs.booking_id = ANY(${sql.raw(`'{${bookingIds.join(',')}}'::uuid[]`)})
      `);
      console.log('\nCheckout Settlements:', JSON.stringify(settlements, null, 2));
    }
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
