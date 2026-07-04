/**
 * Shared availability SSOT — admin and customer surfaces must use this module
 * for bed counts (available, occupied, reserved, maintenance) as of a date.
 */

import {
  aggregateOccupancyCounts,
  type OccupancyAggregateCounts,
} from '@/src/lib/bedOccupancyResolve';
import {
  fetchBedOccupancyRows,
  getOccupancyCountsByPg,
  getOccupancyCountsByRoom,
  resolveBedOccupancyRows,
} from '@/src/services/bedOccupancyBatch';

export type AvailabilitySummary = {
  totalBeds: number;
  /** Beds free to book today (open now). */
  availableBeds: number;
  openNowBeds: number;
  bookableBeds: number;
  occupiedBeds: number;
  reservedBeds: number;
  noticeBeds: number;
  checkoutPendingBeds: number;
  maintenanceBeds: number;
  blockedBeds: number;
  vacatingSoon: number;
  occupancyPct: number;
};

export type { OccupancyAggregateCounts };

const EMPTY_SUMMARY: AvailabilitySummary = {
  totalBeds: 0,
  availableBeds: 0,
  openNowBeds: 0,
  bookableBeds: 0,
  occupiedBeds: 0,
  reservedBeds: 0,
  noticeBeds: 0,
  checkoutPendingBeds: 0,
  maintenanceBeds: 0,
  blockedBeds: 0,
  vacatingSoon: 0,
  occupancyPct: 0,
};

function toSummary(counts: OccupancyAggregateCounts): AvailabilitySummary {
  return {
    totalBeds: counts.totalBeds,
    availableBeds: counts.openNowBeds,
    openNowBeds: counts.openNowBeds,
    bookableBeds: counts.bookableBeds,
    occupiedBeds: counts.occupiedBeds,
    reservedBeds: counts.reservedBeds,
    noticeBeds: counts.noticeBeds,
    checkoutPendingBeds: counts.checkoutPendingBeds,
    maintenanceBeds: counts.maintenanceBeds,
    blockedBeds: counts.blockedBeds,
    vacatingSoon: counts.vacatingSoon,
    occupancyPct: counts.occupancyPct,
  };
}

export async function getPgAvailabilitySummaries(
  pgIds: string[],
  asOfDate?: string,
): Promise<Map<string, AvailabilitySummary>> {
  if (pgIds.length === 0) return new Map();
  const counts = await getOccupancyCountsByPg(pgIds, asOfDate);
  const out = new Map<string, AvailabilitySummary>();
  for (const [pgId, c] of counts) {
    out.set(pgId, toSummary(c));
  }
  return out;
}

export async function getPgAvailabilitySummary(
  pgId: string,
  asOfDate?: string,
): Promise<AvailabilitySummary> {
  const map = await getPgAvailabilitySummaries([pgId], asOfDate);
  return map.get(pgId) ?? { ...EMPTY_SUMMARY };
}

export async function getRoomAvailabilitySummaries(
  roomIds: string[],
  asOfDate?: string,
): Promise<Map<string, AvailabilitySummary>> {
  if (roomIds.length === 0) return new Map();
  const counts = await getOccupancyCountsByRoom(roomIds, asOfDate);
  const out = new Map<string, AvailabilitySummary>();
  for (const [roomId, c] of counts) {
    out.set(roomId, toSummary(c));
  }
  return out;
}

/** Resolve per-bed facts and aggregate — used when callers need both rows and counts. */
export async function resolvePgBedAvailability(
  pgId: string,
  asOfDate?: string,
): Promise<{ summary: AvailabilitySummary; bedCount: number }> {
  const rows = await fetchBedOccupancyRows({ pgId, asOfDate });
  const resolved = resolveBedOccupancyRows(rows);
  return {
    summary: toSummary(aggregateOccupancyCounts(resolved)),
    bedCount: resolved.length,
  };
}

export { getOccupancyCountsByPg, getOccupancyCountsByRoom };
