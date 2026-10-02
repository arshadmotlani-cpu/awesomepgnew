/* eslint-disable no-console */
/** Fast read-only October 2026 rent invoice status for active monthly residents. */
import { sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-october-2026-rent-readonly.ts');

const BILLING_MONTH = '2026-10-01';

async function main() {
  const { closeDb, db } = await import('../src/db/client');

  const rows = await db.execute<{
    full_name: string;
    booking_code: string;
    pg_name: string;
    room_number: string;
    bed_code: string;
    billing_day: number | null;
    billing_policy: string | null;
    check_in: string;
    checkout: string | null;
    invoice_number: string | null;
    inv_status: string | null;
    rent_paise: number | null;
    inv_count: string;
  }>(sql`
    WITH active AS (
      SELECT DISTINCT ON (b.id)
        b.id AS booking_id,
        b.booking_code,
        c.full_name,
        p.name AS pg_name,
        r.room_number,
        bd.bed_code,
        to_char(lower(br.stay_range), 'YYYY-MM-DD') AS check_in,
        CASE WHEN upper(br.stay_range) IS NULL THEN NULL
             ELSE to_char(upper(br.stay_range), 'YYYY-MM-DD') END AS checkout,
        rbp.billing_day,
        rbp.billing_cycle_policy AS billing_policy
      FROM bookings b
      JOIN customers c ON c.id = b.customer_id
      JOIN bed_reservations br ON br.booking_id = b.id AND br.status = 'active' AND br.kind = 'primary'
      JOIN beds bd ON bd.id = br.bed_id
      JOIN rooms r ON r.id = bd.room_id
      JOIN floors f ON f.id = r.floor_id
      JOIN pgs p ON p.id = f.pg_id
      LEFT JOIN resident_billing_profiles rbp ON rbp.booking_id = b.id
      WHERE b.status = 'confirmed'
        AND b.is_test = false AND c.is_test = false
        AND b.duration_mode IN ('monthly', 'open_ended')
        AND CURRENT_DATE <@ br.stay_range
        AND br.stay_range && daterange('2026-10-01'::date, '2026-11-01'::date, '[)')
      ORDER BY b.id, bd.bed_code
    ),
    inv AS (
      SELECT booking_id,
             count(*) FILTER (WHERE status != 'cancelled')::int AS active_cnt,
             count(*)::int AS total_cnt,
             max(invoice_number) FILTER (WHERE status != 'cancelled') AS invoice_number,
             max(status) FILTER (WHERE status != 'cancelled') AS inv_status,
             max(rent_paise) FILTER (WHERE status != 'cancelled') AS rent_paise
      FROM rent_invoices
      WHERE billing_month = ${BILLING_MONTH}::date AND is_adhoc = false
      GROUP BY booking_id
    )
    SELECT a.full_name, a.booking_code, a.pg_name, a.room_number, a.bed_code,
           a.billing_day, a.billing_policy, a.check_in, a.checkout,
           i.invoice_number, i.inv_status, i.rent_paise,
           coalesce(i.total_cnt, 0)::text AS inv_count
    FROM active a
    LEFT JOIN inv i ON i.booking_id = a.booking_id
    ORDER BY a.pg_name, a.room_number, a.bed_code
  `);

  console.log('Resident | PG | Room | Bed | Oct Rent | Invoice | Status | Notes');
  let hasBill = 0;
  let missing = 0;
  let dups = 0;
  let totalNewPaise = 0;
  const missingList: string[] = [];

  for (const r of rows) {
    const cnt = Number(r.inv_count);
    const rent = r.rent_paise != null ? `₹${(r.rent_paise / 100).toLocaleString('en-IN')}` : '—';
    const inv = r.invoice_number ?? '—';
    const st = r.inv_status ?? '—';
    let notes = '';
    if (cnt > 1) {
      notes = 'DUPLICATE ROWS';
      dups += 1;
    }
    if (r.inv_status && r.inv_status !== 'cancelled') {
      hasBill += 1;
    } else {
      missing += 1;
      missingList.push(`${r.full_name} (${r.booking_code})`);
    }
    const pg = r.pg_name.replace(/ - AWESOME PG.*/i, '').trim();
    console.log(
      `${r.full_name} | ${pg} | ${r.room_number} | ${r.bed_code} | ${rent} | ${inv} | ${st} | ${notes}`,
    );
  }

  console.log('\n--- DB snapshot ---');
  console.log(`Active Oct-intersect residents: ${rows.length}`);
  console.log(`With non-cancelled Oct rent invoice: ${hasBill}`);
  console.log(`Missing Oct rent invoice: ${missing}`);
  console.log(`Duplicate invoice row flags: ${dups}`);
  if (missingList.length) {
    console.log('\nMissing:', missingList.join('\n  '));
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
