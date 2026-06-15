import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env' });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, connect_timeout: 10 });

  const beds = await sql`
    SELECT p.name AS pg_name, r.room_number, b.bed_code, b.id AS bed_id, b.status AS bed_inventory,
           br.id AS reservation_id, br.status AS reservation_status, br.kind, br.created_at AS reservation_created,
           lower(br.stay_range)::date AS stay_from,
           c.id AS customer_id, c.full_name, c.phone, c.email, c.kyc_status, c.created_at AS customer_since,
           bk.id AS booking_id, bk.booking_code, bk.status AS booking_status, bk.created_at AS booking_created,
           bk.total_paise, bk.deposit_paise, bk.duration_mode
    FROM pgs p
    JOIN floors f ON f.pg_id = p.id AND f.archived_at IS NULL
    JOIN rooms r ON r.floor_id = f.id AND r.archived_at IS NULL
    JOIN beds b ON b.room_id = r.id AND b.archived_at IS NULL
    LEFT JOIN bed_reservations br ON br.bed_id = b.id AND br.status = 'active' AND CURRENT_DATE <@ br.stay_range
    LEFT JOIN bookings bk ON bk.id = br.booking_id
    LEFT JOIN customers c ON c.id = bk.customer_id
    WHERE p.name ILIKE '%shanti%'
      AND r.room_number = '203'
      AND b.bed_code ILIKE '%B4%'
  `;

  console.log('=== BED 203 B4 ===');
  console.log(JSON.stringify(beds, null, 2));

  const room203 = await sql`
    SELECT b.bed_code, b.status AS inventory, c.full_name, c.phone, c.kyc_status,
           bk.booking_code, bk.status AS booking_status, br.status AS reservation_status
    FROM pgs p
    JOIN floors f ON f.pg_id = p.id
    JOIN rooms r ON r.floor_id = f.id AND r.room_number = '203'
    JOIN beds b ON b.room_id = r.id AND b.archived_at IS NULL
    LEFT JOIN bed_reservations br ON br.bed_id = b.id AND br.status = 'active' AND CURRENT_DATE <@ br.stay_range
    LEFT JOIN bookings bk ON bk.id = br.booking_id
    LEFT JOIN customers c ON c.id = bk.customer_id
    WHERE p.name ILIKE '%shanti%'
    ORDER BY b.bed_code
  `;
  console.log('\n=== ROOM 203 ALL BEDS ===');
  console.log(JSON.stringify(room203, null, 2));

  const byName = await sql`
    SELECT c.full_name, c.phone, c.kyc_status, bk.booking_code, bk.status, bk.created_at,
           r.room_number, b.bed_code, p.name AS pg_name
    FROM customers c
    LEFT JOIN bookings bk ON bk.customer_id = c.id
    LEFT JOIN bed_reservations br ON br.booking_id = bk.id AND br.status = 'active'
    LEFT JOIN beds b ON b.id = br.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN pgs p ON p.id = f.pg_id
    WHERE c.full_name ILIKE '%harss%' OR c.full_name ILIKE '%harsh%' OR c.full_name ILIKE '%harsad%'
    ORDER BY bk.created_at DESC NULLS LAST LIMIT 15
  `;
  console.log('\n=== NAME SEARCH ===');
  console.log(JSON.stringify(byName, null, 2));

  const bid = beds[0]?.booking_id as string | undefined;
  const cid = beds[0]?.customer_id as string | undefined;

  if (bid && cid) {
    const payments = await sql`
      SELECT id, purpose, provider, provider_payment_id, amount_paise, status, paid_at, created_at
      FROM payments WHERE booking_id = ${bid} ORDER BY created_at
    `;
    console.log('\n=== PAYMENTS ===');
    console.log(JSON.stringify(payments, null, 2));

    const kyc = await sql`
      SELECT id, status, created_at, reviewed_at, rejection_reason
      FROM kyc_submissions WHERE customer_id = ${cid} ORDER BY created_at DESC LIMIT 5
    `;
    console.log('\n=== KYC SUBMISSIONS ===');
    console.log(JSON.stringify(kyc, null, 2));

    const rent = await sql`
      SELECT invoice_number, billing_month, rent_paise, status, due_date, paid_at, created_at
      FROM rent_invoices WHERE booking_id = ${bid} ORDER BY billing_month DESC LIMIT 8
    `;
    console.log('\n=== RENT INVOICES ===');
    console.log(JSON.stringify(rent, null, 2));

    const deposit = await sql`
      SELECT entry_kind, amount_paise, reason, created_at
      FROM deposit_ledger WHERE booking_id = ${bid} ORDER BY created_at
    `;
    console.log('\n=== DEPOSIT LEDGER ===');
    console.log(JSON.stringify(deposit, null, 2));

    const audit = await sql`
      SELECT action, entity, actor_type, created_at, diff
      FROM audit_log
      WHERE entity_id = ${bid} OR entity_id = ${cid}
      ORDER BY created_at DESC LIMIT 25
    `;
    console.log('\n=== AUDIT LOG ===');
    console.log(JSON.stringify(audit, null, 2));

    const qr = await sql`
      SELECT pr.id, pr.amount_paise, pr.status, pr.created_at, pr.reviewed_at, pc.name AS category
      FROM pg_payment_records pr
      JOIN pg_payment_categories pc ON pc.id = pr.category_id
      WHERE pr.customer_id = ${cid}
      ORDER BY pr.created_at DESC LIMIT 10
    `;
    console.log('\n=== QR PAYMENT APPROVALS ===');
    console.log(JSON.stringify(qr, null, 2));
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
