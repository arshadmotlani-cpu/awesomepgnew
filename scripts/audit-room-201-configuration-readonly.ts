/* eslint-disable no-console */
/**
 * READ-ONLY forensic — Room 201 configuration / beds / bed_prices / schedules.
 * USE_PRODUCTION_DB=1 npx tsx scripts/audit-room-201-configuration-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-room-201-configuration-readonly');

import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';

async function main() {
  const roomRows = await db.execute(sql`
    SELECT r.id::text AS room_id, r.room_number, p.slug, p.name AS pg_name, rt.name AS room_type, rt.default_capacity,
           (SELECT count(*)::int FROM beds b WHERE b.room_id = r.id AND b.archived_at IS NULL) AS active_beds,
           (SELECT count(*)::int FROM beds b WHERE b.room_id = r.id AND b.archived_at IS NOT NULL) AS archived_beds
    FROM rooms r
    JOIN room_types rt ON rt.id = r.room_type_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    WHERE r.room_number = '201' AND r.archived_at IS NULL
    ORDER BY p.name
    LIMIT 5
  `);
  console.log('\n=== Room 201 snapshot ===');
  for (const row of roomRows) console.log(row);
  const roomId = (roomRows[0] as { room_id?: string })?.room_id;
  if (!roomId) {
    await closeDb();
    return;
  }

  const beds = await db.execute(sql`
    SELECT id::text, bed_code, status, archived_at::text
    FROM beds WHERE room_id = ${roomId}::uuid
    ORDER BY bed_code
  `);
  console.log('\n=== Beds ===');
  for (const b of beds) console.log(b);

  const prices = await db.execute(sql`
    SELECT bp.id::text, b.bed_code, bp.effective_from::text, bp.effective_to::text,
           bp.monthly_rate_paise::bigint::int, bp.weekly_rate_paise::bigint::int,
           bp.daily_rate_paise::bigint::int, bp.updated_at::text
    FROM bed_prices bp
    JOIN beds b ON b.id = bp.bed_id
    WHERE b.room_id = ${roomId}::uuid
    ORDER BY b.bed_code, bp.effective_from DESC, bp.created_at DESC
  `);
  console.log('\n=== bed_prices ===');
  for (const p of prices) console.log(p);

  const schedules = await db.execute(sql`
    SELECT id::text, status, effective_from::text, target_bed_count, room_type_name,
           monthly_rate_paise::bigint::int, created_at::text, updated_at::text, applied_at::text, cancelled_at::text
    FROM room_configuration_schedules
    WHERE room_id = ${roomId}::uuid
    ORDER BY effective_from DESC, updated_at DESC
    LIMIT 20
  `);
  console.log('\n=== room_configuration_schedules ===');
  for (const s of schedules) console.log(s);

  const audit = await db.execute(sql`
    SELECT action, entity, created_at::text, diff
    FROM audit_log
    WHERE entity_id = ${roomId}::uuid OR diff::text ILIKE '%201%'
    ORDER BY created_at DESC
    LIMIT 15
  `);
  console.log('\n=== Recent audit (room entity) ===');
  for (const a of audit) console.log(a);

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
