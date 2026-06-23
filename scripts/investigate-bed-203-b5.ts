#!/usr/bin/env npx tsx
/**
 * Trace Room 203 Bed B5 (Shanti Nagar) resident lifecycle in production.
 *
 * Usage:
 *   DATABASE_URL=… npx tsx scripts/investigate-bed-203-b5.ts
 *   DATABASE_URL=… npx tsx scripts/investigate-bed-203-b5.ts --phone=6369363982
 */
import 'dotenv/config';
import postgres from 'postgres';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const phoneFilter = arg('phone') ?? '6369363982';
  const sql = postgres(url, { max: 1, connect_timeout: 20 });

  console.log('\n=== Shanti Nagar · Room 203 · Bed B5 lifecycle ===\n');

  const beds = await sql`
    SELECT b.id AS bed_id, b.bed_code, b.status AS inventory, b.manual_occupied,
           p.id AS pg_id, p.name AS pg_name, r.room_number
    FROM beds b
    JOIN rooms r ON r.id = b.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    WHERE p.name ILIKE '%shanti%' AND r.room_number = '203' AND b.bed_code ILIKE '%B5%'
  `;
  console.log('--- Bed ---');
  console.log(JSON.stringify(beds, null, 2));

  const bedId = beds[0]?.bed_id as string | undefined;

  const resident = await sql`
    SELECT c.id AS customer_id, c.full_name, c.phone, c.kyc_status,
           bk.id AS booking_id, bk.booking_code, bk.status AS booking_status,
           br.id AS reservation_id, br.status AS reservation_status, br.kind,
           lower(br.stay_range)::date AS stay_from,
           upper(br.stay_range)::date AS stay_to
    FROM customers c
    JOIN bookings bk ON bk.customer_id = c.id
    LEFT JOIN bed_reservations br ON br.booking_id = bk.id AND br.kind = 'primary'
    LEFT JOIN beds b ON b.id = br.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN pgs p ON p.id = f.pg_id
    WHERE c.phone ILIKE ${'%' + phoneFilter + '%'}
       OR (p.name ILIKE '%shanti%' AND r.room_number = '203' AND b.bed_code ILIKE '%B5%')
    ORDER BY bk.created_at DESC
    LIMIT 5
  `;
  console.log('\n--- Resident / booking / reservation ---');
  console.log(JSON.stringify(resident, null, 2));

  const vacating = await sql`
    SELECT vr.*, bk.booking_code
    FROM vacating_requests vr
    JOIN bookings bk ON bk.id = vr.booking_id
    JOIN customers c ON c.id = vr.customer_id
    WHERE c.phone ILIKE ${'%' + phoneFilter + '%'}
       OR bk.id IN (
         SELECT br.booking_id FROM bed_reservations br
         WHERE br.bed_id = ${bedId ?? '00000000-0000-0000-0000-000000000000'}::uuid
       )
    ORDER BY vr.created_at DESC
  `;
  console.log('\n--- Vacating requests ---');
  console.log(JSON.stringify(vacating, null, 2));

  const settlements = await sql`
    SELECT cs.id, cs.status, cs.vacating_request_id, cs.booking_id, cs.created_at, cs.updated_at,
           bk.booking_code, c.full_name
    FROM checkout_settlements cs
    JOIN bookings bk ON bk.id = cs.booking_id
    JOIN customers c ON c.id = cs.customer_id
    WHERE c.phone ILIKE ${'%' + phoneFilter + '%'}
    ORDER BY cs.created_at DESC
  `;
  console.log('\n--- Checkout settlements ---');
  console.log(JSON.stringify(settlements, null, 2));

  const orphanSettlements = await sql`
    SELECT cs.id, cs.vacating_request_id, cs.status
    FROM checkout_settlements cs
    LEFT JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    WHERE vr.id IS NULL
  `;
  console.log('\n--- Orphan settlements (missing vacating FK) ---');
  console.log(JSON.stringify(orphanSettlements, null, 2));

  const residentReqs = await sql`
    SELECT rr.id, rr.type, rr.status, rr.pg_id, rr.booking_id, rr.created_at
    FROM resident_requests rr
    JOIN customers c ON c.id = rr.customer_id
    WHERE c.phone ILIKE ${'%' + phoneFilter + '%'}
    ORDER BY rr.created_at DESC
  `;
  console.log('\n--- Resident requests ---');
  console.log(JSON.stringify(residentReqs, null, 2));

  const actionItems = await sql`
    SELECT id, type, title, status, source_key, metadata
    FROM action_items
    WHERE metadata::text ILIKE ${'%' + phoneFilter + '%'}
       OR title ILIKE '%Harish%'
       OR metadata->>'bookingId' IN (SELECT id::text FROM bookings bk JOIN customers c ON c.id = bk.customer_id WHERE c.phone ILIKE ${'%' + phoneFilter + '%'})
    ORDER BY updated_at DESC
    LIMIT 15
  `;
  console.log('\n--- Action items ---');
  console.log(JSON.stringify(actionItems, null, 2));

  const ledger = await sql`
    SELECT dl.entry_kind, dl.amount_paise, dl.reason, dl.created_at, bk.booking_code
    FROM deposit_ledger dl
    JOIN bookings bk ON bk.id = dl.booking_id
    JOIN customers c ON c.id = bk.customer_id
    WHERE c.phone ILIKE ${'%' + phoneFilter + '%'}
    ORDER BY dl.created_at ASC
  `;
  console.log('\n--- Deposit ledger ---');
  console.log(JSON.stringify(ledger, null, 2));

  const adminListSim = await sql`
    SELECT vr.id, c.full_name, loc.pg_name, loc.room_number, loc.bed_code
    FROM vacating_requests vr
    INNER JOIN bookings b ON b.id = vr.booking_id
    INNER JOIN customers c ON c.id = vr.customer_id
    LEFT JOIN LATERAL (
      SELECT p.name AS pg_name, r.room_number, bd.bed_code
      FROM bed_reservations br
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN rooms r ON r.id = bd.room_id
      INNER JOIN floors f ON f.id = r.floor_id
      INNER JOIN pgs p ON p.id = f.pg_id
      WHERE br.booking_id = vr.booking_id AND br.kind = 'primary'
      ORDER BY br.created_at DESC
      LIMIT 1
    ) loc ON true
    WHERE c.phone ILIKE ${'%' + phoneFilter + '%'}
  `;
  console.log('\n--- Admin vacating list simulation (LEFT JOIN LATERAL) ---');
  console.log(JSON.stringify(adminListSim, null, 2));

  const oldInnerJoin = await sql`
    SELECT vr.id
    FROM vacating_requests vr
    INNER JOIN bookings b ON b.id = vr.booking_id
    INNER JOIN customers c ON c.id = vr.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    WHERE c.phone ILIKE ${'%' + phoneFilter + '%'}
  `;
  console.log('\n--- Old INNER JOIN vacating query (would drop row if no primary bed) ---');
  console.log(JSON.stringify(oldInnerJoin, null, 2));

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
