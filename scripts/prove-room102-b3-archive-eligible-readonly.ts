/**
 * READ-ONLY: prove Room 102 B3 is the eligible empty bed for 3→2 decrease.
 * USE_PRODUCTION_DB=1 npx tsx scripts/prove-room102-b3-archive-eligible-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
import { planRoomCapacityDecrease } from '../src/lib/roomCapacityBedPlanner';

loadProductionAuditEnv();
requireDatabaseUrl('prove-room102-b3');

async function main() {
  const { sql } = await import('drizzle-orm');
  const { closeDb, db } = await import('../src/db/client');
  const { getBedArchiveBlockReason } = await import('../src/lib/bedOccupancyCheck');

  function rows<T extends Record<string, unknown>>(r: unknown): T[] {
    if (Array.isArray(r)) return r as T[];
    return ((r as { rows?: T[] })?.rows ?? []) as T[];
  }

  const [room] = rows<{ room_id: string }>(
    await db.execute(sql`
      SELECT r.id::text AS room_id
      FROM rooms r
      JOIN floors f ON f.id = r.floor_id
      JOIN pgs p ON p.id = f.pg_id
      WHERE r.room_number = '102' AND p.name ILIKE '%shantinagar%'
      LIMIT 1
    `),
  );
  if (!room) throw new Error('Room 102 not found');

  const beds = rows<{ id: string; bed_code: string }>(
    await db.execute(sql`
      SELECT b.id::text AS id, b.bed_code
      FROM beds b
      WHERE b.room_id = ${room.room_id}::uuid AND b.archived_at IS NULL
      ORDER BY b.bed_code
    `),
  );

  const activeBeds = [];
  for (const bed of beds) {
    const block = await getBedArchiveBlockReason(bed.id);
    activeBeds.push({
      id: bed.id,
      bedCode: bed.bed_code,
      occupied: block?.reason === 'occupied',
      blockReason: block?.reason ?? null,
    });
  }

  const plan = planRoomCapacityDecrease({
    activeBeds: activeBeds.map((b) => ({
      id: b.id,
      bedCode: b.bedCode,
      occupied: b.occupied,
    })),
    targetBedCount: 2,
  });

  console.log(
    JSON.stringify(
      {
        roomId: room.room_id,
        activeBeds,
        decreasePlan: {
          blocked: plan.blocked,
          archiveBedCodes: plan.archiveBedCodes,
          preserveCount: plan.preserveBedIds.length,
        },
      },
      null,
      2,
    ),
  );

  if (plan.blocked || plan.archiveBedCodes[0] !== 'B3') {
    process.exitCode = 1;
    throw new Error('Expected B3 as sole archive candidate for 3→2 Room 102');
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
