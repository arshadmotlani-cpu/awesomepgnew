/**
 * Find customers with active bed_reservations that activeTenancyLateralSql would miss.
 * Usage: npx tsx scripts/diagnose-resident-occupancy.ts [name filter]
 */
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local' });

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

async function main() {
  const nameFilter = process.argv[2]?.trim();
  const nameClause = nameFilter
    ? sql`AND c.full_name ILIKE ${`%${nameFilter}%`}`
    : sql``;

  const rows = await db.execute<{
    full_name: string;
    booking_code: string;
    duration_mode: string;
    booking_status: string;
    res_status: string;
    kind: string;
    in_range: boolean;
    is_placeholder: boolean;
    pg_name: string;
    room_number: string;
    bed_code: string;
    residency_status: string;
    would_match_active_tenancy: boolean;
  }>(sql`
    SELECT
      c.full_name,
      b.booking_code,
      b.duration_mode,
      b.status AS booking_status,
      br.status AS res_status,
      br.kind,
      CURRENT_DATE <@ br.stay_range AS in_range,
      (
        b.notes ILIKE '%occupancy placeholder%'
        OR b.notes ILIKE '%Full occupancy marker%'
        OR b.notes ILIKE '%full occupancy%'
        OR b.pricing_snapshot::text ILIKE '%Occupancy placeholder%'
      ) AS is_placeholder,
      p.name AS pg_name,
      r.room_number,
      bd.bed_code,
      c.residency_status::text AS residency_status,
      (
        b.duration_mode IN ('monthly', 'open_ended')
        AND br.status = 'active'
        AND br.kind = 'primary'
        AND CURRENT_DATE <@ br.stay_range
        AND NOT (
          b.notes ILIKE '%occupancy placeholder%'
          OR b.notes ILIKE '%Full occupancy marker%'
          OR b.notes ILIKE '%full occupancy%'
          OR b.pricing_snapshot::text ILIKE '%Occupancy placeholder%'
        )
      ) AS would_match_active_tenancy
    FROM customers c
    INNER JOIN bookings b ON b.customer_id = c.id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary' AND br.status = 'active'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE c.archived_at IS NULL
      AND b.status = 'confirmed'
      AND CURRENT_DATE <@ br.stay_range
      ${nameClause}
    ORDER BY c.full_name
  `);

  const mismatches = rows.filter((r) => !r.would_match_active_tenancy);
  console.log(`Total active reservations: ${rows.length}`);
  console.log(`Would miss activeTenancyLateralSql: ${mismatches.length}\n`);

  for (const r of mismatches) {
    console.log(
      [
        r.full_name,
        r.booking_code,
        `mode=${r.duration_mode}`,
        r.is_placeholder ? 'PLACEHOLDER' : '',
        `${r.pg_name} R${r.room_number} ${r.bed_code}`,
        `residency=${r.residency_status}`,
      ]
        .filter(Boolean)
        .join(' | '),
    );
  }

  const targets = ['Waqar', 'Krishna', 'Vijay', 'Harish'];
  console.log('\n--- Named validation targets ---');
  for (const t of targets) {
    const found = rows.filter((r) => r.full_name.toLowerCase().includes(t.toLowerCase()));
    for (const r of found) {
      console.log(
        `${r.full_name}: ${r.pg_name} R${r.room_number} ${r.bed_code} | match=${r.would_match_active_tenancy} | mode=${r.duration_mode} | residency=${r.residency_status}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
