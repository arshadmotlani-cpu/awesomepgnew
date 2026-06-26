/**
 * Pricing Command Center — single write orchestrator for bed_prices with preview.
 */

import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bedPrices, beds, floors, pgs, rooms } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';

export type PricingPreviewRow = {
  bedId: string;
  bedCode: string;
  roomNumber: string;
  pgName: string;
  currentMonthlyPaise: number;
  proposedMonthlyPaise: number;
};

export type PricingRevisionPreview = {
  pgId: string;
  percentChange: number;
  rows: PricingPreviewRow[];
  affectedCount: number;
};

export async function previewPgPricingRevision(
  session: AdminSession,
  pgId: string,
  percentChange: number,
): Promise<PricingRevisionPreview | null> {
  if (!adminCanAccessPg(session, pgId)) return null;

  const rows = await db
    .select({
      bedId: beds.id,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
      pgName: pgs.name,
      monthlyPaise: bedPrices.monthlyRatePaise,
    })
    .from(bedPrices)
    .innerJoin(beds, eq(beds.id, bedPrices.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(pgs.id, pgId),
        or(isNull(bedPrices.effectiveTo), sql`${bedPrices.effectiveTo} >= CURRENT_DATE`),
      ),
    );

  const multiplier = 1 + percentChange / 100;
  const preview: PricingPreviewRow[] = rows.map((r) => ({
    bedId: r.bedId,
    bedCode: r.bedCode,
    roomNumber: r.roomNumber,
    pgName: r.pgName,
    currentMonthlyPaise: r.monthlyPaise,
    proposedMonthlyPaise: Math.round(r.monthlyPaise * multiplier),
  }));

  return {
    pgId,
    percentChange,
    rows: preview,
    affectedCount: preview.length,
  };
}

export async function applyPgPricingRevision(
  session: AdminSession,
  pgId: string,
  percentChange: number,
): Promise<{ ok: boolean; message: string; updated: number }> {
  const preview = await previewPgPricingRevision(session, pgId, percentChange);
  if (!preview) return { ok: false, message: 'Access denied or PG not found.', updated: 0 };

  let updated = 0;
  for (const row of preview.rows) {
    if (row.proposedMonthlyPaise === row.currentMonthlyPaise) continue;
    await db
      .update(bedPrices)
      .set({ monthlyRatePaise: row.proposedMonthlyPaise, updatedAt: new Date() })
      .where(eq(bedPrices.bedId, row.bedId));
    updated += 1;
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: session.adminId,
    entity: 'bed_prices',
    entityId: pgId,
    action: 'bulk_percent_revision',
    diff: { percentChange, updated, previewCount: preview.affectedCount },
  });

  return {
    ok: true,
    message: `Updated ${updated} bed price(s) by ${percentChange}%.`,
    updated,
  };
}
