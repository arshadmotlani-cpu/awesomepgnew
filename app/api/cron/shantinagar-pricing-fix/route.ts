import { NextRequest } from 'next/server';
import { ilike, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pgs } from '@/src/db/schema';
import { env } from '@/src/lib/env';
import { paiseToInr } from '@/src/lib/format';
import { applyPgPricingAdjustment } from '@/src/services/pgInventory';
import { getPgInventory } from '@/src/services/pgInventory';
import { SHANTINAGAR_PRICING_TARGET_ROOMS } from '@/src/services/shantinagarJulyRentProduction';
import type { AdminSession } from '@/src/lib/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON_SESSION: AdminSession = {
  kind: 'admin',
  sessionId: 'cron-shantinagar-pricing-fix',
  adminId: 'cron-shantinagar-pricing-fix',
  email: 'cron@system',
  fullName: 'Shantinagar Pricing Fix',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function handle(req: NextRequest) {
  const expected = env.CRON_SECRET;
  if (!expected) {
    return Response.json({ ok: false, reason: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
  const pgSlug = req.nextUrl.searchParams.get('pgSlug') ?? 'shantinagar-awesome-pg';

  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(ilike(pgs.slug, pgSlug))
    .limit(1);

  if (!pg) {
    return Response.json({ ok: false, reason: `PG not found: ${pgSlug}` }, { status: 404 });
  }

  const invBefore = await getPgInventory(CRON_SESSION, pg.id);
  const monthliesBefore = invBefore.beds.map((b) => b.monthlyRatePaise).filter((m) => m > 0);
  const avgBefore =
    monthliesBefore.length > 0
      ? Math.round(monthliesBefore.reduce((sum, m) => sum + m, 0) / monthliesBefore.length)
      : 0;

  const rows = (await db.execute(sql`
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
      ) AS prior_monthly
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
  }>;

  const roomsNeedingFix = new Set<string>();
  const alreadyUpdated: string[] = [];
  const targetRooms = new Set<string>(SHANTINAGAR_PRICING_TARGET_ROOMS);

  for (const row of rows) {
    if (!targetRooms.has(row.room_number)) continue;
    if (row.room_number === '101') continue;
    const current = Number(row.current_monthly);
    const prior = row.prior_monthly != null ? Number(row.prior_monthly) : current;
    const target = prior > 0 ? Math.round(prior * 1.01) : current;
    if (prior > 0 && current === target) {
      alreadyUpdated.push(`Room ${row.room_number} ${row.bed_code}`);
    } else if (prior > 0 && current !== target) {
      roomsNeedingFix.add(row.room_number);
    }
  }

  const roomSummaries: Array<{ roomNumber: string; bedsAffected: number }> = [];

  if (!dryRun) {
    const roomIdByNumber = new Map(invBefore.beds.map((b) => [b.roomNumber, b.roomId]));
    for (const roomNumber of [...roomsNeedingFix].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
      const roomId = roomIdByNumber.get(roomNumber);
      if (!roomId) continue;
      const summary = await applyPgPricingAdjustment(CRON_SESSION, {
        pgId: pg.id,
        roomId,
        tiers: ['monthly'],
        mode: 'percent',
        value: 1,
      });
      roomSummaries.push({ roomNumber, bedsAffected: summary.bedsAffected });
    }
  }

  const invAfter = dryRun ? invBefore : await getPgInventory(CRON_SESSION, pg.id);
  const monthliesAfter = invAfter.beds.map((b) => b.monthlyRatePaise).filter((m) => m > 0);
  const avgAfter =
    monthliesAfter.length > 0
      ? Math.round(monthliesAfter.reduce((sum, m) => sum + m, 0) / monthliesAfter.length)
      : 0;

  return Response.json({
    ok: true,
    dryRun,
    pgName: pg.name,
    roomsInPg: [...new Set(invBefore.beds.map((b) => b.roomNumber))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    ),
    bedsInPg: invBefore.beds.length,
    previousAvgMonthlyRentPaise: avgBefore,
    previousAvgMonthlyRentInr: paiseToInr(avgBefore),
    newAvgMonthlyRentPaise: avgAfter,
    newAvgMonthlyRentInr: paiseToInr(avgAfter),
    alreadyUpdatedBeds: alreadyUpdated,
    roomsNeedingFix: [...roomsNeedingFix].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    roomsUpdated: dryRun ? [] : roomSummaries.map((r) => r.roomNumber),
    bedsUpdated: dryRun ? 0 : roomSummaries.reduce((sum, r) => sum + r.bedsAffected, 0),
    roomSummaries,
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
