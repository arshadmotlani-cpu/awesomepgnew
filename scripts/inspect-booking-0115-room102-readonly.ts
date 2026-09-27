/* eslint-disable no-console */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('inspect-booking-0115');

import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';
import { isBedAvailable } from '@/src/services/availability';
import { getRoomConfigurationEffectiveOn } from '@/src/services/roomConfigurationSchedule';

async function main() {
  const bk = await db.execute(sql`
    SELECT bk.id::text AS booking_id, bk.booking_code, bk.status::text,
           bk.expected_checkout_date::text, bk.blocks_room_availability, c.full_name,
           br.id::text AS res_id, br.bed_id::text, br.stay_range::text, br.status::text AS res_status,
           br.kind, b.bed_code, r.room_number, p.name AS pg_name, b.archived_at::text AS bed_archived
    FROM bookings bk
    JOIN customers c ON c.id = bk.customer_id
    LEFT JOIN bed_reservations br ON br.booking_id = bk.id
    LEFT JOIN beds b ON b.id = br.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN pgs p ON p.id = f.pg_id
    WHERE bk.booking_code = 'APG-2026-0115'
    ORDER BY br.created_at NULLS LAST
  `);
  console.log('BOOKING', JSON.stringify(bk, null, 2));

  const r102 = await db.execute(sql`
    SELECT r.id::text AS room_id, b.id::text AS bed_id, b.bed_code, b.status, b.archived_at::text
    FROM rooms r
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    JOIN beds b ON b.room_id = r.id
    WHERE r.room_number = '102' AND p.name ILIKE '%shantinagar%' AND b.bed_code = 'B3'
  `);
  console.log('ROOM102 B3', JSON.stringify(r102, null, 2));
  const roomId = (r102[0] as { room_id?: string })?.room_id;
  const bedId = (r102[0] as { bed_id?: string })?.bed_id;

  const sched = await db.execute(sql`
    SELECT s.id::text, s.status, s.effective_from::text, s.target_bed_count, s.room_type_name
    FROM room_configuration_schedules s
    JOIN rooms r ON r.id = s.room_id
    WHERE r.room_number = '102'
      AND s.pg_id = (SELECT p.id FROM pgs p WHERE p.name ILIKE '%shantinagar%' LIMIT 1)
    ORDER BY s.effective_from DESC
    LIMIT 10
  `);
  console.log('ROOM102 SCHEDULES', JSON.stringify(sched, null, 2));

  if (roomId) {
    for (const d of ['2026-09-26', '2026-09-27', '2026-10-01', '2026-10-02']) {
      const eff = await getRoomConfigurationEffectiveOn(roomId, d);
      console.log('effectiveOn', d, eff);
    }
  }

  if (bedId) {
    for (const start of ['2026-09-26', '2026-09-27']) {
      const avail = await isBedAvailable({
        bedId,
        startDate: start,
        endDate: '2026-10-02',
      });
      console.log('isBedAvailable', { start, end: '2026-10-02', avail });
    }
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
