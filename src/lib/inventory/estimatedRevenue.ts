/**
 * Estimated revenue — pure inventory baseline (no DB).
 *
 * Monthly = sum of configured monthly rent for each rentable bed today.
 * Yearly = monthly × 12. Independent of occupancy % and collected revenue.
 */

export const ESTIMATED_REVENUE_MONTHS_PER_YEAR = 12;

export type EstimatedRevenueBedCounts = {
  rentableBeds: number;
  occupiedBeds: number;
  vacantRentableBeds: number;
  maintenanceBeds: number;
  blockedBeds: number;
};

export type EstimatedRevenuePgRow = EstimatedRevenueBedCounts & {
  pgId: string;
  pgName: string;
  monthlyRevenuePaise: number;
  yearlyRevenuePaise: number;
};

export type EstimatedRevenueSnapshot = EstimatedRevenueBedCounts & {
  asOfDate: string;
  monthlyRevenuePaise: number;
  yearlyRevenuePaise: number;
  byPg: EstimatedRevenuePgRow[];
};

/** SSOT: only `available` beds are rentable; maintenance/blocked excluded. Archived beds are not in inputs. */
export function isBedStatusRentableForEstimatedRevenue(
  status: 'available' | 'maintenance' | 'blocked',
): boolean {
  return status === 'available';
}

export function sumEstimatedMonthlyRevenuePaise(monthlyRatePaisePerBed: number[]): number {
  return monthlyRatePaisePerBed.reduce((sum, rate) => sum + Math.max(0, rate), 0);
}

export function computeEstimatedYearlyRevenuePaise(monthlyRevenuePaise: number): number {
  return monthlyRevenuePaise * ESTIMATED_REVENUE_MONTHS_PER_YEAR;
}

export function aggregateEstimatedRevenueByPg(
  byPg: EstimatedRevenuePgRow[],
): Omit<EstimatedRevenueSnapshot, 'asOfDate' | 'byPg'> {
  const monthlyRevenuePaise = byPg.reduce((sum, row) => sum + row.monthlyRevenuePaise, 0);
  return {
    monthlyRevenuePaise,
    yearlyRevenuePaise: computeEstimatedYearlyRevenuePaise(monthlyRevenuePaise),
    rentableBeds: byPg.reduce((sum, row) => sum + row.rentableBeds, 0),
    occupiedBeds: byPg.reduce((sum, row) => sum + row.occupiedBeds, 0),
    vacantRentableBeds: byPg.reduce((sum, row) => sum + row.vacantRentableBeds, 0),
    maintenanceBeds: byPg.reduce((sum, row) => sum + row.maintenanceBeds, 0),
    blockedBeds: byPg.reduce((sum, row) => sum + row.blockedBeds, 0),
  };
}

/** Build per-PG row from rentable bed monthly rates + occupancy breakdown (for tests). */
export function buildEstimatedRevenuePgRow(input: {
  pgId: string;
  pgName: string;
  monthlyRatePaisePerRentableBed: number[];
  counts: EstimatedRevenueBedCounts;
}): EstimatedRevenuePgRow {
  const monthlyRevenuePaise = sumEstimatedMonthlyRevenuePaise(input.monthlyRatePaisePerRentableBed);
  return {
    pgId: input.pgId,
    pgName: input.pgName,
    monthlyRevenuePaise,
    yearlyRevenuePaise: computeEstimatedYearlyRevenuePaise(monthlyRevenuePaise),
    ...input.counts,
  };
}
