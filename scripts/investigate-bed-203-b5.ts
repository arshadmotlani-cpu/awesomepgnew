/**
 * Production investigation: Shanti Nagar PG, Room 203, Bed B5 lifecycle.
 *
 * Usage:
 *   DATABASE_URL='postgres://…' npx tsx scripts/investigate-bed-203-b5.ts
 *   DOTENV_CONFIG_PATH=/tmp/awesomepg-prod.env npx tsx -r dotenv/config scripts/investigate-bed-203-b5.ts
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

  const beds = await sql`
    SELECT b.id AS bed_id, b.bed_code, b.manual_occupied, b.status AS inventory
    FROM pgs p
    JOIN floors f ON f.pg_id = p.id AND f.archived_at IS NULL
    JOIN rooms r ON r.floor_id = f.id AND r.archived_at IS NULL
    JOIN beds b ON b.room_id = r.id AND b.archived_at IS NULL
    WHERE p.name ILIKE '%shanti%' AND r.room_number = '203' AND b.bed_code ILIKE '%5%'
  `;
  console.log('\n=== BED ===');
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

  const primaryDupes = await sql`
    SELECT br.booking_id, bk.booking_code, count(*)::int AS primary_count,
           array_agg(br.id::text ORDER BY br.created_at) AS reservation_ids,
           array_agg(br.status ORDER BY br.created_at) AS statuses
    FROM bed_reservations br
    JOIN bookings bk ON bk.id = br.booking_id
    WHERE br.bed_id = ${bedId} AND br.kind = 'primary'
    GROUP BY br.booking_id, bk.booking_code
    HAVING count(*) > 1
  `;
  console.log('\n=== DUPLICATE PRIMARY ON BED ===');
  console.log(JSON.stringify(primaryDupes, null, 2));

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

  const bookingIds = [...new Set(allRes.map((r) => r.booking_id as string))];

  for (const bookingId of bookingIds) {
    console.log(`\n=== BOOKING ${bookingId} ===`);

    const vacating = await sql`
      SELECT vr.id, vr.status, vr.vacating_date::text, vr.notice_given_date::text,
             vr.deduction_paise, vr.deposit_refund_paise, vr.created_at, vr.updated_at
      FROM vacating_requests vr
      WHERE vr.booking_id = ${bookingId}::uuid
      ORDER BY vr.created_at DESC
    `;
    console.log('vacating_requests:', JSON.stringify(vacating, null, 2));

    const settlements = await sql`
      SELECT cs.id, cs.status, cs.vacating_request_id, cs.final_refund_paise,
             cs.created_at, cs.updated_at
      FROM checkout_settlements cs
      WHERE cs.booking_id = ${bookingId}::uuid
      ORDER BY cs.created_at DESC
    `;
    console.log('checkout_settlements:', JSON.stringify(settlements, null, 2));

    const depositSettlements = await sql`
      SELECT id, source, final_refund_paise, created_at
      FROM deposit_settlements
      WHERE booking_id = ${bookingId}::uuid
      ORDER BY created_at DESC
    `;
    console.log('deposit_settlements:', JSON.stringify(depositSettlements, null, 2));

    const refundReqs = await sql`
      SELECT id, type, status, amount_paise, created_at, updated_at
      FROM resident_requests
      WHERE booking_id = ${bookingId}::uuid
        AND type = 'deposit_refund'
      ORDER BY created_at DESC
    `;
    console.log('resident_requests (deposit_refund):', JSON.stringify(refundReqs, null, 2));

    const ledger = await sql`
      SELECT id, entry_kind, amount_paise, reason, created_at
      FROM deposit_ledger
      WHERE booking_id = ${bookingId}::uuid
      ORDER BY created_at
    `;
    console.log('deposit_ledger:', JSON.stringify(ledger, null, 2));

    const actions = await sql`
      SELECT id, type, status, source_key, title, metadata, created_at, updated_at
      FROM action_items
      WHERE metadata->>'bookingId' = ${bookingId}
         OR source_key LIKE ${'%' + bookingId + '%'}
      ORDER BY created_at DESC
    `;
    console.log('action_items:', JSON.stringify(actions, null, 2));
  }

  const orphanSettlements = await sql`
    SELECT cs.id, cs.booking_id, cs.vacating_request_id, cs.status
    FROM checkout_settlements cs
    LEFT JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    WHERE cs.booking_id = ANY(${bookingIds}::uuid[])
      AND (vr.id IS NULL OR vr.status = 'rejected')
  `;
  console.log('\n=== ORPHAN CHECKOUT SETTLEMENTS ===');
  console.log(JSON.stringify(orphanSettlements, null, 2));

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
