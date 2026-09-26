#!/usr/bin/env npx tsx
/**
 * Read-only: migration 0151 + date-aware configuration smoke (any room with schedules).
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/verify-room-configuration-production-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-room-configuration');

import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';
import { resolveEffectiveBedCountForRoom } from '@/src/services/roomConfigurationSchedule';
import { loadBedPrice } from '@/src/services/pricing';

async function main() {
  const [meta] = await db.execute<{ has_table: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'room_configuration_schedules'
    ) AS has_table
  `);

  console.log('\n=== Migration 0151 (room_configuration_schedules) ===');
  console.log('Table present:', meta?.has_table === true ? 'YES' : 'NO');
  const scheduleRows = meta?.has_table
    ? (
        await db.execute<{ c: number }>(sql`
          SELECT count(*)::int AS c FROM room_configuration_schedules
        `)
      )[0]?.c ?? 0
    : 0;
  console.log('Schedule row count:', scheduleRows);

  if (!meta?.has_table) {
    console.error('\nFAIL: Apply src/db/migrations/0151_room_configuration_schedules.sql in production.');
    await closeDb();
    process.exit(1);
  }

  const schedules = await db.execute<{
    room_id: string;
    room_number: string;
    effective_from: string;
    target_bed_count: number;
    status: string;
    physical_beds: number;
  }>(sql`
    SELECT
      s.room_id::text,
      r.room_number,
      s.effective_from::text,
      s.target_bed_count,
      s.status,
      (
        SELECT count(*)::int FROM beds b
        WHERE b.room_id = s.room_id AND b.archived_at IS NULL AND b.status != 'maintenance'
      ) AS physical_beds
    FROM room_configuration_schedules s
    INNER JOIN rooms r ON r.id = s.room_id
    WHERE s.status IN ('scheduled', 'applied')
    ORDER BY s.effective_from ASC
    LIMIT 20
  `);

  console.log('\n=== Scheduled/applied configurations (sample) ===');
  for (const row of schedules) {
    const before = await resolveEffectiveBedCountForRoom(
      row.room_id,
      '2026-09-30',
    );
    const onEffective = await resolveEffectiveBedCountForRoom(
      row.room_id,
      row.effective_from.slice(0, 10),
    );
    console.log(
      `Room ${row.room_number}: physical=${row.physical_beds} target=${row.target_bed_count} effective=${row.effective_from.slice(0, 10)} status=${row.status}`,
    );
    console.log(
      `  resolveEffectiveBedCount(2026-09-30)=${before} · on effective date=${onEffective}`,
    );
    if (row.effective_from.startsWith('2026-10') && row.target_bed_count === 2) {
      console.log('  (Oct 2-sharing schedule candidate — Sep should stay physical/target-pre-apply)');
    }
  }

  const [bedSample] = await db.execute<{ bed_id: string; room_id: string }>(sql`
    SELECT b.id::text AS bed_id, b.room_id::text AS room_id
    FROM beds b
    WHERE b.archived_at IS NULL
    LIMIT 1
  `);
  if (bedSample) {
    const sepPrice = await loadBedPrice(bedSample.bed_id, '2026-09-01');
    const octPrice = await loadBedPrice(bedSample.bed_id, '2026-10-01');
    console.log('\n=== Rent pricing SSOT (sample bed — not room-specific proof) ===');
    console.log('Sep monthly paise:', sepPrice?.monthlyRatePaise ?? null);
    console.log('Oct monthly paise:', octPrice?.monthlyRatePaise ?? null);
  }

  console.log('\nOK: migration table live; use room-specific schedule rows above for 3→2 proof.');
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
