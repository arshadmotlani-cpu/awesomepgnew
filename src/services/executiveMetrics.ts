/**
 * Executive KPIs — occupancy and revenue metrics from SSOT engines.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { aggregateOccupancyCounts } from '@/src/lib/bedOccupancyResolve';
import {
  fetchBedOccupancyRows,
  resolveBedOccupancyRows,
} from '@/src/services/bedOccupancyBatch';
import { getGlobalFinancialAggregates } from '@/src/services/residentFinancialEngine';

export type ExecutiveMetrics = {
  occupancyPct: number;
  vacantBeds: number;
  reservedBeds: number;
  occupiedBeds: number;
  totalBeds: number;
  outstandingRentPaise: number;
  outstandingElectricityPaise: number;
  depositLiabilityPaise: number;
  moveInsThisMonth: number;
  moveOutsThisMonth: number;
};

export async function getExecutiveMetrics(billingMonth?: string): Promise<ExecutiveMetrics> {
  const month = billingMonth ?? `${new Date().toISOString().slice(0, 7)}-01`;
  const [occupancyRows, financials, moveIns, moveOuts] = await Promise.all([
    fetchBedOccupancyRows(),
    getGlobalFinancialAggregates(),
    db.execute<{ cnt: number }>(sql`
      SELECT count(*)::int AS cnt
      FROM bed_reservations br
      INNER JOIN bookings bk ON bk.id = br.booking_id
      WHERE br.status = 'active'
        AND br.kind = 'primary'
        AND lower(br.stay_range) >= ${month}::date
        AND lower(br.stay_range) < (${month}::date + interval '1 month')
    `),
    db.execute<{ cnt: number }>(sql`
      SELECT count(*)::int AS cnt
      FROM vacating_requests vr
      WHERE vr.status = 'completed'
        AND vr.resolved_at >= ${month}::date
        AND vr.resolved_at < (${month}::date + interval '1 month')
    `),
  ]);

  const counts = aggregateOccupancyCounts(resolveBedOccupancyRows(occupancyRows));
  const vacantBeds = Math.max(0, counts.openNowBeds);

  return {
    occupancyPct: counts.occupancyPct,
    vacantBeds,
    reservedBeds: counts.reservedBeds,
    occupiedBeds: counts.occupiedBeds,
    totalBeds: counts.totalBeds,
    outstandingRentPaise: financials.rent.outstandingPaise,
    outstandingElectricityPaise: financials.electricity.outstandingPaise,
    depositLiabilityPaise: financials.deposit.outstandingPaise,
    moveInsThisMonth: Number(Array.from(moveIns)[0]?.cnt ?? 0),
    moveOutsThisMonth: Number(Array.from(moveOuts)[0]?.cnt ?? 0),
  };
}
