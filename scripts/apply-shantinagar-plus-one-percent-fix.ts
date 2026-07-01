#!/usr/bin/env npx tsx
/**
 * Apply +1% monthly rent to every SHANTINAGAR bed that was missed by a room-only apply.
 * Skips beds already at exactly round(base * 1.01) when base is the prior bed_prices row.
 *
 *   npx tsx scripts/apply-shantinagar-plus-one-percent-fix.ts
 *   npx tsx scripts/apply-shantinagar-plus-one-percent-fix.ts --execute
 */
import { readFileSync } from 'node:fs';
import { ilike, sql } from 'drizzle-orm';
import { paiseToInr } from '@/src/lib/format';

function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.off', '.env.bak', '.env.local', '.env.production.pull']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value) {
        process.env.DATABASE_URL = value;
        return;
      }
    } catch {
      // try next file
    }
  }
}

loadDatabaseUrl();

const SCRIPT_SESSION = {
  kind: 'admin' as const,
  sessionId: 'shantinagar-plus-one-fix',
  adminId: 'shantinagar-plus-one-fix',
  email: 'script@system',
  fullName: 'Shantinagar +1% Fix',
  role: 'super_admin' as const,
  pgScope: [] as string[],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function main() {
  const execute = process.argv.includes('--execute');
  const pgSlug = process.argv.find((a) => a.startsWith('--pg-slug='))?.split('=')[1] ?? 'shantinagar-awesome-pg';

  const { db, closeDb } = await import('@/src/db/client');
  const { pgs } = await import('@/src/db/schema');
  const { applyPgPricingAdjustment } = await import('@/src/services/pgInventory');
  const { getPgInventory } = await import('@/src/services/pgInventory');

  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name, slug: pgs.slug })
    .from(pgs)
    .where(ilike(pgs.slug, pgSlug))
    .limit(1);

  if (!pg) {
    console.error(`PG not found for slug ${pgSlug}`);
    process.exit(1);
  }

  const inv = await getPgInventory(SCRIPT_SESSION, pg.id);
  const beds = inv.beds;
  const monthlies = beds.map((b) => b.monthlyRatePaise).filter((m) => m > 0);
  const avgBefore =
    monthlies.length > 0
      ? Math.round(monthlies.reduce((sum, m) => sum + m, 0) / monthlies.length)
      : 0;

  const roomNumbers = [...new Set(beds.map((b) => b.roomNumber))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  const audit = (await db.execute(sql`
    SELECT DISTINCT ON (bp.bed_id)
      bp.bed_id,
      r.room_number,
      b.bed_code,
      bp.monthly_rate_paise AS current_monthly,
      (
        SELECT bp2.monthly_rate_paise
        FROM bed_prices bp2
        WHERE bp2.bed_id = bp.bed_id
          AND bp2.id <> bp.id
        ORDER BY bp2.effective_from DESC, bp2.created_at DESC
        LIMIT 1
      ) AS prior_monthly,
      bp.created_at::date = CURRENT_DATE AS created_today
    FROM bed_prices bp
    JOIN beds b ON b.id = bp.bed_id
    JOIN rooms r ON r.id = b.room_id
    JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pg.id}::uuid
      AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
    ORDER BY bp.bed_id, bp.effective_from DESC, bp.created_at DESC
  `)) as Array<{
    bed_id: string;
    room_number: string;
    bed_code: string;
    current_monthly: string | number;
    prior_monthly: string | number | null;
    created_today: boolean;
  }>;

  const alreadyPlusOne = audit.filter((row) => {
    const current = Number(row.current_monthly);
    const prior = row.prior_monthly != null ? Number(row.prior_monthly) : null;
    if (!prior || prior <= 0) return false;
    return current === Math.round(prior * 1.01);
  });

  const needsUpdate = audit.filter((row) => {
    const current = Number(row.current_monthly);
    const prior = row.prior_monthly != null ? Number(row.prior_monthly) : current;
    if (prior <= 0) return false;
    return current !== Math.round(prior * 1.01);
  });

  console.log(`\n=== ${pg.name} +1% fix audit ===\n`);
  console.log(`Rooms in PG: ${roomNumbers.length}`);
  console.log(`Beds in PG: ${beds.length}`);
  console.log(`Current average monthly rent: ${paiseToInr(avgBefore)}`);
  console.log(`Beds already at +1% of prior rate: ${alreadyPlusOne.length}`);
  console.log(`Beds still needing +1%: ${needsUpdate.length}`);

  if (alreadyPlusOne.length > 0) {
    console.log('\nAlready updated (+1% applied):');
    for (const row of alreadyPlusOne) {
      console.log(`  Room ${row.room_number} ${row.bed_code} → ${paiseToInr(Number(row.current_monthly))}`);
    }
  }

  if (needsUpdate.length > 0) {
    console.log('\nStill at old rate (need +1%):');
    for (const row of needsUpdate) {
      const prior = Number(row.prior_monthly ?? row.current_monthly);
      const target = Math.round(prior * 1.01);
      console.log(
        `  Room ${row.room_number} ${row.bed_code} ${paiseToInr(Number(row.current_monthly))} → ${paiseToInr(target)}`,
      );
    }
  }

  if (!execute) {
    console.log('\nDry run only. Re-run with --execute to apply PG-wide +1% to beds still at old rates.');
    await closeDb();
    return;
  }

  if (needsUpdate.length === 0) {
    console.log('\nNothing to fix — every bed is already at +1% of its prior rate.');
    await closeDb();
    return;
  }

  // Apply +1% only to target rooms (skip 101 — already updated).
  const TARGET = new Set(['102', '201', '202', '203', '204', '301', '302']);
  const roomsToFix = [...new Set(needsUpdate.map((r) => r.room_number))]
    .filter((r) => TARGET.has(r) && r !== '101')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  let bedsFixed = 0;
  const roomIdsByNumber = new Map(beds.map((b) => [b.roomNumber, b.roomId]));

  for (const roomNumber of roomsToFix) {
    const roomId = roomIdsByNumber.get(roomNumber);
    if (!roomId) continue;
    const roomBeds = beds.filter((b) => b.roomNumber === roomNumber);
    const needsInRoom = needsUpdate.filter((r) => r.room_number === roomNumber);
    if (needsInRoom.length === roomBeds.length) {
      const { applyPgPricingAdjustment: apply } = await import('@/src/services/pgInventory');
      const summary = await apply(SCRIPT_SESSION, {
        pgId: pg.id,
        roomId,
        tiers: ['monthly'],
        mode: 'percent',
        value: 1,
      });
      bedsFixed += summary.bedsAffected;
      console.log(`Fixed room ${roomNumber}: ${summary.bedsAffected} bed(s)`);
    }
  }

  const invAfter = await getPgInventory(SCRIPT_SESSION, pg.id);
  const afterMonthlies = invAfter.beds.map((b) => b.monthlyRatePaise).filter((m) => m > 0);
  const avgAfter =
    afterMonthlies.length > 0
      ? Math.round(afterMonthlies.reduce((sum, m) => sum + m, 0) / afterMonthlies.length)
      : 0;

  console.log('\n=== AFTER FIX ===');
  console.log(`Beds updated: ${bedsFixed}`);
  console.log(`New average monthly rent: ${paiseToInr(avgAfter)}`);
  console.log(`Rooms updated: ${roomsToFix.join(', ')}`);

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  try {
    const { closeDb } = await import('@/src/db/client');
    await closeDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
