/* eslint-disable no-console */
/**
 * Trace recent bed reserve holds + B5 occupancy facts.
 * Usage: DATABASE_URL=... npx tsx scripts/trace-reserve-production.ts [bedCode]
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { fetchBedOccupancyRows, resolveBedOccupancyRows } from '../src/services/bedOccupancyBatch';

const bedCode = process.argv[2] ?? 'B5';

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const holds = await db.execute<{
    booking_id: string;
    booking_code: string;
    booking_status: string;
    duration_mode: string;
    hold_id: string;
    hold_status: string;
    reserve_code: string;
    bed_code: string;
    check_in_date: string;
    reserve_start: string;
    hold_expires_at: string | null;
    updated_at: string;
  }>(sql`
    SELECT
      b.id::text AS booking_id,
      b.booking_code,
      b.status::text AS booking_status,
      b.duration_mode::text AS duration_mode,
      brh.id::text AS hold_id,
      brh.status::text AS hold_status,
      brh.reserve_code,
      bd.bed_code,
      brh.check_in_date::text,
      brh.reserve_start::text,
      brh.hold_expires_at::text,
      brh.updated_at::text
    FROM bed_reserve_holds brh
    JOIN bookings b ON b.id = brh.booking_id
    JOIN beds bd ON bd.id = brh.bed_id
    ORDER BY brh.created_at DESC
    LIMIT 10
  `);

  console.log('\n=== Recent bed_reserve_holds ===');
  for (const row of holds) {
    console.log(JSON.stringify(row, null, 2));
  }

  const [bed] = await db.execute<{ id: string; bed_code: string; pg_slug: string }>(sql`
    SELECT bd.id::text, bd.bed_code, p.slug AS pg_slug
    FROM beds bd
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE upper(bd.bed_code) = upper(${bedCode})
    ORDER BY bd.created_at DESC
    LIMIT 1
  `);

  if (!bed) {
    console.log(`\nBed ${bedCode} not found`);
    return;
  }

  const rows = await fetchBedOccupancyRows({ bedId: bed.id });
  const resolved = resolveBedOccupancyRows(rows)[0];
  console.log(`\n=== Occupancy SSOT for ${bed.bed_code} (${bed.pg_slug}) ===`);
  console.log({
    adminState: resolved?.adminView.state,
    publicState: resolved?.customerView.state,
    activeBedReserveCheckIn: rows[0]?.activeBedReserveCheckIn,
    underReviewRequest: rows[0]?.underReviewRequest,
    isOpenNow: resolved?.isOpenNow,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closeDb());
