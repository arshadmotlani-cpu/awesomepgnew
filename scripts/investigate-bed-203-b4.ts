import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, connect_timeout: 15 });

  const beds = await sql`
    SELECT b.id AS bed_id, b.bed_code, b.manual_occupied, b.status AS inventory
    FROM pgs p
    JOIN floors f ON f.pg_id = p.id AND f.archived_at IS NULL
    JOIN rooms r ON r.floor_id = f.id AND r.archived_at IS NULL
    JOIN beds b ON b.room_id = r.id AND b.archived_at IS NULL
    WHERE p.name ILIKE '%shanti%' AND r.room_number = '203' AND b.bed_code ILIKE '%4%'
  `;
  console.log('=== BED ===');
  console.log(JSON.stringify(beds, null, 2));

  const bedId = beds[0]?.bed_id as string | undefined;
  if (!bedId) {
    await sql.end();
    return;
  }

  const allRes = await sql`
    SELECT br.id, br.status, br.kind,
           lower(br.stay_range)::text AS stay_from,
           upper(br.stay_range)::text AS stay_to,
           br.booking_id, bk.booking_code, bk.status AS booking_status,
           c.full_name, c.phone,
           br.created_at, br.updated_at
    FROM bed_reservations br
    JOIN bookings bk ON bk.id = br.booking_id
    JOIN customers c ON c.id = bk.customer_id
    WHERE br.bed_id = ${bedId}
    ORDER BY br.created_at
  `;
  console.log('\n=== ALL RESERVATIONS ===');
  console.log(JSON.stringify(allRes, null, 2));

  const activeToday = await sql`
    SELECT br.id, br.status, br.kind,
           lower(br.stay_range)::text AS stay_from,
           upper(br.stay_range)::text AS stay_to,
           bk.booking_code, bk.status AS booking_status, c.full_name
    FROM bed_reservations br
    JOIN bookings bk ON bk.id = br.booking_id
    JOIN customers c ON c.id = bk.customer_id
    WHERE br.bed_id = ${bedId}
      AND br.status IN ('hold', 'active')
      AND CURRENT_DATE <@ br.stay_range
  `;
  console.log('\n=== BLOCKING TODAY ===');
  console.log(JSON.stringify(activeToday, null, 2));

  const payments = await sql`
    SELECT p.purpose, p.status, p.amount_paise, p.paid_at, bk.booking_code
    FROM payments p
    JOIN bookings bk ON bk.id = p.booking_id
    JOIN bed_reservations br ON br.booking_id = bk.id AND br.bed_id = ${bedId}
    ORDER BY p.created_at DESC LIMIT 10
  `;
  console.log('\n=== PAYMENTS (bed bookings) ===');
  console.log(JSON.stringify(payments, null, 2));

  const vacating = await sql`
    SELECT vr.id, vr.status, vr.vacating_date, vr.created_at, vr.updated_at,
           bk.booking_code, c.full_name
    FROM vacating_requests vr
    JOIN bookings bk ON bk.id = vr.booking_id
    JOIN customers c ON c.id = bk.customer_id
    JOIN bed_reservations br ON br.booking_id = vr.booking_id AND br.bed_id = ${bedId}
    ORDER BY vr.created_at DESC LIMIT 10
  `;
  console.log('\n=== VACATING ===');
  console.log(JSON.stringify(vacating, null, 2));

  const audit = await sql`
    SELECT action, entity, actor_type, created_at, diff
    FROM audit_log
    WHERE entity_id = ${bedId}::uuid
       OR diff::text ILIKE ${'%' + bedId + '%'}
    ORDER BY created_at DESC LIMIT 25
  `;
  console.log('\n=== BED AUDIT LOG ===');
  console.log(JSON.stringify(audit, null, 2));

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
