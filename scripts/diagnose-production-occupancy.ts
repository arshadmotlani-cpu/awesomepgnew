/**
 * Read-only production occupancy diagnostic — Room 204 beds, migration 0146, vacating 20 Aug residents.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/diagnose-production-occupancy.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('diagnose-production-occupancy.ts');

import { sql } from 'drizzle-orm';
import { createClient } from '@/src/db/client';
import { fetchBedOccupancyRows } from '@/src/services/bedOccupancyBatch';
import { resolveBedOccupancy } from '@/src/lib/bedOccupancyResolve';

async function main() {
  const { db, close } = createClient({ max: 1 });

  console.log('=== Production occupancy diagnostic ===\n');

  const enum146 = await db.execute<{ enumlabel: string }>(sql`
    SELECT enumlabel FROM pg_enum
    WHERE enumtypid = 'action_item_type'::regtype AND enumlabel = 'vacating_date_change'
  `);
  console.log(
    'Migration 0146 (vacating_date_change enum):',
    enum146.length > 0 ? 'APPLIED' : 'MISSING',
  );

  const beds204 = await db.execute<{
    booking_code: string;
    customer_name: string;
    bed_code: string;
    bed_id: string;
    room_number: string;
    pg_name: string;
    vacating_date: string | null;
    vr_status: string | null;
    stay_upper: string | null;
    dc_status: string | null;
    dc_requested: string | null;
    dc_current: string | null;
  }>(sql`
    SELECT bk.booking_code, c.full_name AS customer_name, b.bed_code, b.id AS bed_id,
      r.room_number, p.name AS pg_name,
      vr.vacating_date::text, vr.status AS vr_status, upper(br.stay_range)::text AS stay_upper,
      vdcr.status AS dc_status, vdcr.requested_vacating_date::text AS dc_requested,
      vdcr.current_vacating_date::text AS dc_current
    FROM beds b JOIN rooms r ON r.id = b.room_id
    JOIN floors f ON f.id = r.floor_id JOIN pgs p ON p.id = f.pg_id
    JOIN bed_reservations br ON br.bed_id = b.id AND br.status = 'active' AND br.kind = 'primary'
    JOIN bookings bk ON bk.id = br.booking_id
    JOIN customers c ON c.id = bk.customer_id
    LEFT JOIN vacating_requests vr ON vr.booking_id = bk.id
    LEFT JOIN vacating_date_change_requests vdcr ON vdcr.vacating_request_id = vr.id
      AND vdcr.status = 'pending'
    WHERE r.room_number = '204'
    ORDER BY b.bed_code
  `);

  console.log('\n--- Room 204 active beds ---');
  for (const row of beds204) {
    console.log(JSON.stringify(row, null, 2));
    if (row.bed_id) {
      const occRows = await fetchBedOccupancyRows({ bedId: row.bed_id });
      const occ = occRows[0];
      if (occ) {
        const resolved = resolveBedOccupancy(occ);
        console.log('  Engine label:', resolved.customerView.sublabel);
        console.log('  bookableFromDate:', resolved.snapshot.bookableFromDate);
        console.log('  vacatingDate:', occ.vacatingDate, 'status:', occ.vacatingStatus);
      }
    }
  }

  const aug20Residents = await db.execute<{
    booking_code: string;
    customer_name: string;
    bed_code: string;
    room_number: string;
    vacating_date: string;
  }>(sql`
    SELECT bk.booking_code, c.full_name AS customer_name, b.bed_code, r.room_number,
      vr.vacating_date::text
    FROM vacating_requests vr
    JOIN bookings bk ON bk.id = vr.booking_id
    JOIN customers c ON c.id = vr.customer_id
    JOIN bed_reservations br ON br.booking_id = bk.id AND br.kind = 'primary' AND br.status = 'active'
    JOIN beds b ON b.id = br.bed_id JOIN rooms r ON r.id = b.room_id
    WHERE vr.status = 'approved' AND vr.vacating_date = '2026-08-20'
  `);

  console.log('\n--- Residents with approved vacating 20 Aug 2026 ---');
  for (const row of aug20Residents) {
    console.log(JSON.stringify(row));
  }

  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
