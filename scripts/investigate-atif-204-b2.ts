/**
 * Production investigation: Mohd Aatif / Atif — Shanti Nagar PG, Room 204, Bed B2.
 *
 * Usage:
 *   DATABASE_URL='postgres://…' npx tsx scripts/investigate-atif-204-b2.ts
 *   DOTENV_CONFIG_PATH=/tmp/awesomepg-prod.env npx tsx -r dotenv/config scripts/investigate-atif-204-b2.ts
 */
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(url, {
    max: 1,
    connect_timeout: 15,
    ssl: url.includes('localhost') ? undefined : 'require',
  });

  console.log('DB host:', new URL(url.replace(/^postgres:/, 'postgresql:')).hostname);

  const customers = await sql`
    SELECT id, full_name, email, phone, kyc_status, created_at
    FROM customers
    WHERE full_name ILIKE '%atif%' OR full_name ILIKE '%aatif%'
    ORDER BY created_at DESC
  `;
  console.log('\n=== CUSTOMERS (Atif) ===');
  console.log(JSON.stringify(customers, null, 2));

  const beds = await sql`
    SELECT b.id AS bed_id, b.bed_code, b.manual_occupied, b.status AS inventory,
           r.room_number, p.id AS pg_id, p.name AS pg_name, p.slug
    FROM pgs p
    JOIN floors f ON f.pg_id = p.id AND f.archived_at IS NULL
    JOIN rooms r ON r.floor_id = f.id AND r.archived_at IS NULL
    JOIN beds b ON b.room_id = r.id AND b.archived_at IS NULL
    WHERE p.name ILIKE '%shanti%' AND r.room_number = '204'
      AND (b.bed_code ILIKE '%B2%' OR b.bed_code ILIKE '%2%')
    ORDER BY b.bed_code
  `;
  console.log('\n=== BED 204 B2 ===');
  console.log(JSON.stringify(beds, null, 2));

  const bedId = beds.find((b) => String(b.bed_code).toUpperCase().includes('B2'))?.bed_id
    ?? beds[0]?.bed_id;

  if (bedId) {
    const allRes = await sql`
      SELECT br.id, br.status, br.kind,
             lower(br.stay_range)::text AS stay_from,
             upper(br.stay_range)::text AS stay_to,
             br.booking_id, bk.booking_code, bk.status AS booking_status,
             c.id AS customer_id, c.full_name, c.phone,
             br.created_at, br.updated_at
      FROM bed_reservations br
      JOIN bookings bk ON bk.id = br.booking_id
      JOIN customers c ON c.id = bk.customer_id
      WHERE br.bed_id = ${bedId}
      ORDER BY br.created_at DESC
    `;
    console.log('\n=== ALL RESERVATIONS ON BED ===');
    console.log(JSON.stringify(allRes, null, 2));
  }

  const customerIds = customers.map((c) => c.id as string);

  for (const customerId of customerIds) {
    console.log(`\n========== CUSTOMER ${customerId} ==========`);

    const bookings = await sql`
      SELECT bk.id, bk.booking_code, bk.status, bk.created_at, bk.updated_at,
             p.name AS pg_name
      FROM bookings bk
      LEFT JOIN pgs p ON p.id = bk.pg_id
      WHERE bk.customer_id = ${customerId}::uuid
      ORDER BY bk.created_at DESC
    `;
    console.log('\n--- bookings ---');
    console.log(JSON.stringify(bookings, null, 2));

    const vacating = await sql`
      SELECT vr.id, vr.booking_id, bk.booking_code, vr.status,
             vr.vacating_date::text, vr.notice_given_date::text,
             vr.deduction_paise, vr.deposit_refund_paise,
             vr.admin_notes, vr.created_at, vr.updated_at
      FROM vacating_requests vr
      JOIN bookings bk ON bk.id = vr.booking_id
      WHERE bk.customer_id = ${customerId}::uuid
      ORDER BY vr.created_at DESC
    `;
    console.log('\n--- vacating_requests ---');
    console.log(JSON.stringify(vacating, null, 2));

    const settlements = await sql`
      SELECT cs.id, cs.booking_id, bk.booking_code, cs.vacating_request_id,
             cs.status, cs.final_refund_paise, cs.created_at, cs.updated_at
      FROM checkout_settlements cs
      JOIN bookings bk ON bk.id = cs.booking_id
      WHERE bk.customer_id = ${customerId}::uuid
      ORDER BY cs.created_at DESC
    `;
    console.log('\n--- checkout_settlements ---');
    console.log(JSON.stringify(settlements, null, 2));

    const refundReqs = await sql`
      SELECT rr.id, rr.booking_id, bk.booking_code, rr.type, rr.status,
             rr.amount_paise, rr.created_at, rr.updated_at
      FROM resident_requests rr
      JOIN bookings bk ON bk.id = rr.booking_id
      WHERE bk.customer_id = ${customerId}::uuid
      ORDER BY rr.created_at DESC
    `;
    console.log('\n--- resident_requests ---');
    console.log(JSON.stringify(refundReqs, null, 2));

    const actions = await sql`
      SELECT ai.id, ai.type, ai.status, ai.source_key, ai.title,
             ai.metadata, ai.pg_id, ai.created_at, ai.updated_at
      FROM action_items ai
      WHERE ai.metadata->>'customerId' = ${customerId}
         OR ai.metadata->>'residentId' = ${customerId}
         OR ai.title ILIKE '%atif%'
      ORDER BY ai.created_at DESC
      LIMIT 30
    `;
    console.log('\n--- action_items ---');
    console.log(JSON.stringify(actions, null, 2));
  }

  // All vacating for shanti pg
  const pgVacating = await sql`
    SELECT vr.id, vr.status, vr.vacating_date::text, vr.created_at,
           c.full_name, bk.booking_code, r.room_number, b.bed_code
    FROM vacating_requests vr
    JOIN bookings bk ON bk.id = vr.booking_id
    JOIN customers c ON c.id = bk.customer_id
    JOIN pgs p ON p.id = bk.pg_id
    LEFT JOIN LATERAL (
      SELECT br.bed_id FROM bed_reservations br
      WHERE br.booking_id = bk.id AND br.kind = 'primary'
      ORDER BY CASE WHEN br.status = 'active' THEN 0 WHEN br.status = 'hold' THEN 1 ELSE 2 END,
               br.created_at DESC
      LIMIT 1
    ) pr ON true
    LEFT JOIN beds b ON b.id = pr.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE p.name ILIKE '%shanti%'
    ORDER BY vr.created_at DESC
    LIMIT 20
  `;
  console.log('\n=== ALL SHANTI VACATING (recent) ===');
  console.log(JSON.stringify(pgVacating, null, 2));

  // Simulate listAdminVacatingRequests filter — pending/approved only
  const adminQueue = await sql`
    SELECT vr.id, vr.status, c.full_name, bk.booking_code, r.room_number, b.bed_code
    FROM vacating_requests vr
    JOIN bookings bk ON bk.id = vr.booking_id
    JOIN customers c ON c.id = bk.customer_id
    LEFT JOIN LATERAL (
      SELECT br.bed_id FROM bed_reservations br
      WHERE br.booking_id = bk.id AND br.kind = 'primary'
      ORDER BY CASE WHEN br.status = 'active' THEN 0 WHEN br.status = 'hold' THEN 1 ELSE 2 END,
               br.created_at DESC
      LIMIT 1
    ) pr ON true
    LEFT JOIN beds b ON b.id = pr.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE vr.status IN ('pending', 'approved')
    AND c.full_name ILIKE '%atif%'
  `;
  console.log('\n=== ADMIN QUEUE (pending/approved Atif) ===');
  console.log(JSON.stringify(adminQueue, null, 2));

  // Admin visibility simulation
  console.log('\n=== ADMIN VISIBILITY SIMULATION ===');
  for (const customerId of customerIds) {
    const vacating = await sql`
      SELECT vr.id, vr.status, vr.vacating_date::text, vr.created_at,
             bk.booking_code, bk.id AS booking_id
      FROM vacating_requests vr
      JOIN bookings bk ON bk.id = vr.booking_id
      WHERE bk.customer_id = ${customerId}::uuid
      ORDER BY vr.created_at DESC
    `;
    for (const v of vacating) {
      const inPipeline = await sql`
        SELECT vr.id FROM vacating_requests vr
        INNER JOIN bookings b ON b.id = vr.booking_id
        WHERE vr.id = ${v.id}::uuid
      `;
      const inActionSync = await sql`
        SELECT vr.id FROM vacating_requests vr
        INNER JOIN bookings b ON b.id = vr.booking_id
        INNER JOIN customers c ON c.id = vr.customer_id
        LEFT JOIN LATERAL (
          SELECT p.id AS pg_id FROM bed_reservations br
          INNER JOIN beds bd ON bd.id = br.bed_id
          INNER JOIN rooms r ON r.id = bd.room_id
          INNER JOIN floors f ON f.id = r.floor_id
          INNER JOIN pgs p ON p.id = f.pg_id
          WHERE br.booking_id = vr.booking_id AND br.kind = 'primary'
          ORDER BY br.created_at DESC LIMIT 1
        ) loc ON true
        WHERE vr.id = ${v.id}::uuid
      `;
      const oldInnerJoin = await sql`
        SELECT vr.id FROM vacating_requests vr
        INNER JOIN bookings b ON b.id = vr.booking_id
        INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
        WHERE vr.id = ${v.id}::uuid
      `;
      console.log({
        vacatingRequestId: v.id,
        bookingCode: v.booking_code,
        status: v.status,
        vacatingDate: v.vacating_date,
        submittedAt: v.created_at,
        visibleInVacatingList: inPipeline.length > 0,
        visibleInActionSync: inActionSync.length > 0,
        droppedByOldInnerJoin: inPipeline.length > 0 && oldInnerJoin.length === 0,
        adminQueue:
          v.status === 'pending'
            ? '/admin/vacating (Awaiting approval) + /admin/operations'
            : v.status === 'approved'
              ? '/admin/vacating + /admin/checkout-settlements'
              : 'history only',
      });
    }
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
