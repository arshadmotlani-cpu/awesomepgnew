/**
 * Compare Residents page vs Bed Map occupancy resolution per customer.
 * Usage: npx tsx scripts/audit-occupancy-mismatch.ts [name filter]
 */
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local' });

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { bookingHasVerifiedPaymentSql, customerMeetsOccupancyKycPolicySql } from '../src/lib/occupancySqlFilters';

async function main() {
  const nameFilter = process.argv[2]?.trim();
  const nameClause = nameFilter
    ? sql`AND c.full_name ILIKE ${`%${nameFilter}%`}`
    : sql``;

  type Row = {
    customer_id: string;
    full_name: string;
    booking_id: string | null;
    booking_code: string | null;
    booking_status: string | null;
    duration_mode: string | null;
    reservation_id: string | null;
    res_status: string | null;
    res_kind: string | null;
    in_stay_range: boolean | null;
    pg_name: string | null;
    room_number: string | null;
    bed_code: string | null;
    residents_match: boolean;
    bed_map_match: boolean;
    blocked_by_placeholder_filter: boolean;
    blocked_by_payment_gate: boolean;
    notes_snippet: string | null;
  };

  const rows = await db.execute<Row>(sql`
    WITH active_res AS (
      SELECT
        c.id AS customer_id,
        c.full_name,
        bk.id AS booking_id,
        bk.booking_code,
        bk.status AS booking_status,
        bk.duration_mode,
        bk.notes,
        br.id AS reservation_id,
        br.status AS res_status,
        br.kind AS res_kind,
        CURRENT_DATE <@ br.stay_range AS in_stay_range,
        p.name AS pg_name,
        r.room_number,
        bd.bed_code,
        NOT (
          bk.notes ILIKE '%occupancy placeholder%'
          OR bk.notes ILIKE '%Full occupancy marker%'
          OR bk.notes ILIKE '%full occupancy%'
          OR bk.pricing_snapshot::text ILIKE '%Occupancy placeholder%'
        ) AS passes_residents_placeholder_filter,
        ${bookingHasVerifiedPaymentSql} AS passes_bed_map_payment_gate,
        ${customerMeetsOccupancyKycPolicySql} AS passes_bed_map_kyc_gate
      FROM customers c
      INNER JOIN bookings bk ON bk.customer_id = c.id
      INNER JOIN bed_reservations br ON br.booking_id = bk.id
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN rooms r ON r.id = bd.room_id
      INNER JOIN floors f ON f.id = r.floor_id
      INNER JOIN pgs p ON p.id = f.pg_id
      WHERE c.archived_at IS NULL
        AND bk.status = 'confirmed'
        AND br.status = 'active'
        AND br.kind = 'primary'
        AND CURRENT_DATE <@ br.stay_range
        ${nameClause}
    )
    SELECT
      customer_id::text,
      full_name,
      booking_id::text,
      booking_code,
      booking_status,
      duration_mode,
      reservation_id::text,
      res_status,
      res_kind,
      in_stay_range,
      pg_name,
      room_number,
      bed_code,
      (passes_residents_placeholder_filter) AS residents_match,
      (passes_bed_map_payment_gate AND passes_bed_map_kyc_gate) AS bed_map_match,
      (NOT passes_residents_placeholder_filter) AS blocked_by_placeholder_filter,
      (NOT passes_bed_map_payment_gate OR NOT passes_bed_map_kyc_gate) AS blocked_by_payment_gate,
      left(notes, 80) AS notes_snippet
    FROM active_res
    ORDER BY full_name, booking_code
  `);

  const mismatches = rows.filter((r) => r.bed_map_match && !r.residents_match);
  const reverseMismatch = rows.filter((r) => r.residents_match && !r.bed_map_match);

  console.log(`Active reservations scanned: ${rows.length}`);
  console.log(`Bed map YES, Residents NO: ${mismatches.length}`);
  console.log(`Residents YES, Bed map NO: ${reverseMismatch.length}\n`);

  if (mismatches.length) {
    console.log('=== BED MAP ASSIGNED, RESIDENTS UNASSIGNED (root cause candidates) ===');
    for (const r of mismatches) {
      console.log(
        [
          r.full_name,
          `${r.pg_name} R${r.room_number} ${r.bed_code}`,
          `booking=${r.booking_code}`,
          r.blocked_by_placeholder_filter ? 'BLOCKED:placeholder_filter' : '',
          `notes=${r.notes_snippet ?? ''}`,
        ]
          .filter(Boolean)
          .join(' | '),
      );
    }
  }

  console.log('\n=== ALL ACTIVE RESERVATIONS ===');
  for (const r of rows) {
    console.log(
      [
        r.full_name,
        `${r.pg_name ?? '?'} R${r.room_number ?? '?'} ${r.bed_code ?? '?'}`,
        `residents=${r.residents_match ? 'assigned' : 'unassigned'}`,
        `bedMap=${r.bed_map_match ? 'assigned' : 'unassigned'}`,
        r.duration_mode,
      ].join(' | '),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
