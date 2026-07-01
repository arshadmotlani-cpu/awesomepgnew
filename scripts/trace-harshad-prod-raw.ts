#!/usr/bin/env npx tsx
import postgres from 'postgres';

async function main() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  console.log('DB URL length:', url?.length ?? 0);
  if (!url) {
    console.error('No DATABASE_URL');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, ssl: url.includes('localhost') ? undefined : 'require' });

  const pgs = await sql`SELECT id, name, slug FROM pgs ORDER BY name`;
  console.log('\nPGs:', pgs);

  const harshad = await sql`
    SELECT c.id, c.full_name, c.phone,
           ei.invoice_number, ei.amount_paise, ei.status, ei.id AS invoice_id,
           r.room_number, b.bed_code, eb.billing_month, eb.id AS bill_id,
           bk.booking_code, bk.status AS booking_status,
           br.status AS reservation_status, br.kind,
           lower(br.stay_range)::text AS stay_from,
           upper(br.stay_range)::text AS stay_to
    FROM customers c
    JOIN electricity_invoices ei ON ei.customer_id = c.id
    JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
    JOIN beds b ON b.id = ei.bed_id
    JOIN rooms r ON r.id = b.room_id
    JOIN bookings bk ON bk.id = ei.booking_id
    LEFT JOIN bed_reservations br ON br.booking_id = bk.id AND br.bed_id = b.id AND br.kind = 'primary'
    WHERE (c.full_name ILIKE '%harshad%' OR c.full_name ILIKE '%harish%')
      AND eb.billing_month = '2026-06-01'::date
      AND ei.status <> 'cancelled'
  `;
  console.log('\nHarshad/Harish June electricity invoices:', JSON.stringify(harshad, null, 2));

  const room203 = await sql`
    SELECT c.full_name, ei.invoice_number, ei.amount_paise, ei.status, b.bed_code
    FROM electricity_invoices ei
    JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
    JOIN rooms r ON r.id = eb.room_id
    JOIN customers c ON c.id = ei.customer_id
    JOIN beds b ON b.id = ei.bed_id
    WHERE r.room_number = '203'
      AND eb.billing_month = '2026-06-01'::date
      AND ei.status <> 'cancelled'
    ORDER BY c.full_name
  `;
  console.log('\nRoom 203 June invoices:', room203);

  for (const row of harshad) {
    const settlements = await sql`
      SELECT cs.id, cs.status, cs.electricity_share_paise, cs.manual_charge_paise,
             cs.electricity_deduct_from_deposit, cs.electricity_calculation_method,
             vr.vacating_date::text
      FROM checkout_settlements cs
      JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
      WHERE cs.customer_id = ${row.id}::uuid
    `;
    console.log(`\nSettlements for ${row.full_name}:`, settlements);

    const ledger = await sql`
      SELECT esl.id, esl.amount_paise, esl.status, esl.billing_month::text
      FROM electricity_settlement_ledger esl
      WHERE esl.customer_id = ${row.id}::uuid
        AND esl.billing_month = '2026-06-01'::date
    `;
    console.log('Electricity settlement ledger:', ledger);

    const activeToday = await sql`
      SELECT EXISTS (
        SELECT 1 FROM bed_reservations br
        JOIN bookings bk ON bk.id = br.booking_id
        WHERE bk.customer_id = ${row.id}::uuid
          AND br.status = 'active'
          AND br.kind = 'primary'
          AND CURRENT_DATE <@ br.stay_range
      ) AS active_today
    `;
    console.log('Active resident today:', activeToday[0]?.active_today);
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
