/**
 * Estimated revenue — maximum baseline monthly rent from rentable bed inventory.
 * Informational only; not collected revenue or occupancy-weighted forecast.
 */

import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, floors, pgs, rooms } from '@/src/db/schema';
import { todayString } from '@/src/lib/dates';
import { fetchBedOccupancyRows, getOccupancyCountsByPg } from '@/src/services/bedOccupancyBatch';
import { coerceNonNegativePaise } from '@/src/lib/format';
import {
  aggregateEstimatedRevenueByPg,
  computeEstimatedYearlyRevenuePaise,
  isBedStatusRentableForEstimatedRevenue,
  type EstimatedRevenueBedCounts,
  type EstimatedRevenuePgRow,
  type EstimatedRevenueSnapshot,
} from '@/src/lib/inventory/estimatedRevenue';

export type { EstimatedRevenueBedCounts, EstimatedRevenuePgRow, EstimatedRevenueSnapshot };
export {
  aggregateEstimatedRevenueByPg,
  computeEstimatedYearlyRevenuePaise,
  isBedStatusRentableForEstimatedRevenue,
  ESTIMATED_REVENUE_MONTHS_PER_YEAR,
} from '@/src/lib/inventory/estimatedRevenue';

async function loadEffectiveMonthlyRatePaiseByBedId(
  bedIds: string[],
  asOfDate: string,
): Promise<Map<string, number>> {
  if (bedIds.length === 0) return new Map();
  const rows = (await db.execute(sql`
    SELECT DISTINCT ON (bp.bed_id)
      bp.bed_id::text AS bed_id,
      bp.monthly_rate_paise
    FROM bed_prices bp
    WHERE bp.bed_id = ANY(${bedIds}::uuid[])
      AND bp.effective_from <= ${asOfDate}::date
      AND (bp.effective_to IS NULL OR bp.effective_to > ${asOfDate}::date)
    ORDER BY bp.bed_id, bp.effective_from DESC
  `)) as Array<{ bed_id: string; monthly_rate_paise: string | number }>;

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.bed_id, coerceNonNegativePaise(row.monthly_rate_paise));
  }
  return map;
}

function bedCountsFromOccupancyAggregate(
  aggregate: import('@/src/lib/bedOccupancyResolve').OccupancyAggregateCounts,
): EstimatedRevenueBedCounts {
  const rentableBeds = Math.max(
    0,
    aggregate.totalBeds - aggregate.maintenanceBeds - aggregate.blockedBeds,
  );
  const occupiedBeds = aggregate.occupiedBeds;
  return {
    rentableBeds,
    occupiedBeds,
    vacantRentableBeds: Math.max(0, rentableBeds - occupiedBeds),
    maintenanceBeds: aggregate.maintenanceBeds,
    blockedBeds: aggregate.blockedBeds,
  };
}

/**
 * Portfolio + per-PG estimated revenue using:
 * - Inventory: non-archived beds; rentable = status `available` (excludes maintenance/blocked).
 * - Pricing: `bed_prices.monthly_rate_paise` effective on `asOfDate` (same window as loadBedPrice).
 * - Occupancy counts: bed occupancy SSOT (occupied includes occupied available beds).
 */
export async function loadEstimatedRevenueSnapshot(input?: {
  asOfDate?: string;
  pgIds?: string[];
}): Promise<EstimatedRevenueSnapshot> {
  const asOfDate = input?.asOfDate ?? todayString();

  const pgRows = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(and(isNull(pgs.archivedAt), eq(pgs.isActive, true)))
    .orderBy(pgs.name);

  const allowedPgIds = input?.pgIds?.length
    ? new Set(input.pgIds)
    : null;
  const activePgs = allowedPgIds
    ? pgRows.filter((row) => allowedPgIds.has(row.id))
    : pgRows;

  if (activePgs.length === 0) {
    return {
      asOfDate,
      monthlyRevenuePaise: 0,
      yearlyRevenuePaise: 0,
      rentableBeds: 0,
      occupiedBeds: 0,
      vacantRentableBeds: 0,
      maintenanceBeds: 0,
      blockedBeds: 0,
      byPg: [],
    };
  }

  const pgIds = activePgs.map((row) => row.id);
  const occupancyRows = await fetchBedOccupancyRows({ pgIds, asOfDate });
  const occupancyByPg = await getOccupancyCountsByPg(pgIds, asOfDate);

  const rentableBedIdsByPg = new Map<string, string[]>();
  for (const row of occupancyRows) {
    if (!row.pgId) continue;
    if (!isBedStatusRentableForEstimatedRevenue(row.bedStatus)) continue;
    const list = rentableBedIdsByPg.get(row.pgId) ?? [];
    list.push(row.bedId);
    rentableBedIdsByPg.set(row.pgId, list);
  }

  const allRentableBedIds = [...rentableBedIdsByPg.values()].flat();
  const rateByBedId = await loadEffectiveMonthlyRatePaiseByBedId(allRentableBedIds, asOfDate);

  const byPg: EstimatedRevenuePgRow[] = [];
  for (const pg of activePgs) {
    const aggregate = occupancyByPg.get(pg.id);
    const counts = bedCountsFromOccupancyAggregate(
      aggregate ?? {
        totalBeds: 0,
        openNowBeds: 0,
        bookableBeds: 0,
        occupiedBeds: 0,
        reservedBeds: 0,
        noticeBeds: 0,
        maintenanceBeds: 0,
        blockedBeds: 0,
        vacatingSoon: 0,
        occupancyPct: 0,
        futureOpenings: [],
      },
    );

    const bedIds = rentableBedIdsByPg.get(pg.id) ?? [];
    const monthlyRates = bedIds.map((bedId) => rateByBedId.get(bedId) ?? 0);
    const monthlyRevenuePaise = monthlyRates.reduce((sum, rate) => sum + rate, 0);

    byPg.push({
      pgId: pg.id,
      pgName: pg.name,
      monthlyRevenuePaise,
      yearlyRevenuePaise: computeEstimatedYearlyRevenuePaise(monthlyRevenuePaise),
      ...counts,
    });
  }

  const portfolio = aggregateEstimatedRevenueByPg(byPg);
  return {
    asOfDate,
    ...portfolio,
    byPg,
  };
}

/** Sanity check: rentable bed ids match non-archived `available` beds in inventory table. */
export async function listRentableBedIdsForPg(pgId: string, asOfDate?: string): Promise<string[]> {
  void asOfDate;
  const rows = await db
    .select({ id: beds.id })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(floors.pgId, pgId),
        isNull(beds.archivedAt),
        isNull(rooms.archivedAt),
        isNull(floors.archivedAt),
        eq(beds.status, 'available'),
      ),
    );
  return rows.map((row) => row.id);
}
