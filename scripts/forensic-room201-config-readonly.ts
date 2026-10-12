/* eslint-disable no-console */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

async function main() {
  loadProductionAuditEnv();
  requireDatabaseUrl('forensic-room201-config-readonly.ts');

  const { db, closeDb } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');

  const roomId = 'dd469fbf-5eba-4ebc-b28b-d4f06ea3c8d1';

  const room = await db.execute(sql`
    SELECT r.id, r.room_number, rt.name as room_type, rt.default_capacity, r.updated_at
    FROM rooms r
    JOIN room_types rt ON rt.id = r.room_type_id
    WHERE r.id = ${roomId}::uuid
  `);
  console.log('Room:', JSON.stringify(room, null, 2));

  const beds = await db.execute(sql`
    SELECT b.id, b.bed_code, b.status, b.archived_at, b.updated_at
    FROM beds b WHERE b.room_id = ${roomId}::uuid ORDER BY b.bed_code
  `);
  console.log('Beds:', JSON.stringify(beds, null, 2));

  const prices = await db.execute(sql`
    SELECT bp.id, b.bed_code, bp.effective_from, bp.effective_to,
           bp.monthly_rate_paise, bp.created_at, bp.updated_at
    FROM bed_prices bp
    JOIN beds b ON b.id = bp.bed_id
    WHERE b.room_id = ${roomId}::uuid
    ORDER BY b.bed_code, bp.effective_from
  `);
  console.log('Bed prices:', JSON.stringify(prices, null, 2));

  const schedules = await db.execute(sql`
    SELECT id, effective_from, target_bed_count, room_type_name, status, created_at, updated_at
    FROM room_configuration_schedules
    WHERE room_id = ${roomId}::uuid
    ORDER BY effective_from DESC
    LIMIT 10
  `);
  console.log('Schedules:', JSON.stringify(schedules, null, 2));

  const audits = await db.execute(sql`
    SELECT id, action, diff, created_at
    FROM audit_log
    WHERE entity_id = ${roomId}::uuid
       OR (entity = 'room' AND entity_id = ${roomId}::uuid)
    ORDER BY created_at DESC
    LIMIT 8
  `);
  console.log('Recent room audits:', JSON.stringify(audits, null, 2));

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
