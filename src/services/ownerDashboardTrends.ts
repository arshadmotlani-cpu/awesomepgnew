/**
 * Owner Dashboard trend series — Room OS materialized metrics first, financial SSOT fallback.
 */

import { and, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { businessMetricsIndex } from '@/src/db/schema/businessMetricsIndex';
import { addMonths, formatDate, parseDate } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import { getFinancialMetrics, type FinancialMetrics } from '@/src/services/financialMetricsEngine';

export type OwnerRevenueTrendPoint = {
  billingMonth: string;
  label: string;
  rentPaise: number;
  electricityPaise: number;
  lateFeePaise: number;
  otherIncomePaise: number;
  operatingRevenuePaise: number;
  source: 'room_os' | 'financial_engine';
};

export type OwnerOccupancyTrendPoint = {
  billingMonth: string;
  label: string;
  occupancyPct: number;
  source: 'room_os' | 'estimated';
};

export type OwnerPgMonthRevenue = {
  operatingRevenuePaise: number;
};

export type OwnerDashboardTrends = {
  billingMonth: string;
  pgIds: string[];
  revenueTrend: OwnerRevenueTrendPoint[];
  occupancyTrend: OwnerOccupancyTrendPoint[];
  revenueByPgMonth: Array<{
    billingMonth: string;
    byPg: Record<string, OwnerPgMonthRevenue>;
  }>;
  revenueMomPct: number | null;
  priorMonthCollectionRatePct: number | null;
};

type FinRollup = {
  rentPrincipalPaise: number;
  electricityPaise: number;
  lateFeePaise: number;
  otherIncomePaise: number;
  operatingRevenuePaise: number;
  occupancyPct: number;
  totalBeds: number;
};

const ZERO_FIN: FinRollup = {
  rentPrincipalPaise: 0,
  electricityPaise: 0,
  lateFeePaise: 0,
  otherIncomePaise: 0,
  operatingRevenuePaise: 0,
  occupancyPct: 0,
  totalBeds: 0,
};

/** Exported for unit tests — tolerate legacy/partial Room OS snapshots. */
export function finRollupFromSnapshot(snapshot: unknown): FinRollup | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const raw = (snapshot as { financial?: Partial<FinRollup> }).financial;
  if (!raw || typeof raw !== 'object') return null;
  return {
    rentPrincipalPaise: Number(raw.rentPrincipalPaise ?? 0),
    electricityPaise: Number(raw.electricityPaise ?? 0),
    lateFeePaise: Number(raw.lateFeePaise ?? 0),
    otherIncomePaise: Number(raw.otherIncomePaise ?? 0),
    operatingRevenuePaise: Number(raw.operatingRevenuePaise ?? 0),
    occupancyPct: Number(raw.occupancyPct ?? 0),
    totalBeds: Number(raw.totalBeds ?? 0),
  };
}

function finRollupFromEngine(fin: FinancialMetrics): FinRollup {
  return {
    rentPrincipalPaise: fin.operating.rentPrincipalPaise,
    electricityPaise: fin.operating.electricityPaise,
    lateFeePaise: fin.operating.lateFeePaise,
    otherIncomePaise: fin.operating.otherIncomePaise,
    operatingRevenuePaise: fin.operating.operatingRevenuePaise,
    occupancyPct: 0,
    totalBeds: 0,
  };
}

function monthLabel(billingMonth: string): string {
  const d = parseDate(billingMonth);
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' }).format(d);
}

function lastMonths(endBillingMonth: string, count: number): string[] {
  const end = firstOfMonth(endBillingMonth);
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    months.push(firstOfMonth(addMonths(parseDate(end), -i)));
  }
  return months;
}

async function loadFinancialFallback(month: string): Promise<FinRollup> {
  try {
    const fin = await getFinancialMetrics(month);
    return finRollupFromEngine(fin);
  } catch (err) {
    console.error('[owner-dashboard-trends] financial fallback failed', month, err);
    return ZERO_FIN;
  }
}

export function emptyOwnerDashboardTrends(
  billingMonthInput: string,
  pgIds: string[],
): OwnerDashboardTrends {
  const billingMonth = firstOfMonth(billingMonthInput);
  const months = lastMonths(billingMonth, 12);
  return {
    billingMonth,
    pgIds,
    revenueTrend: months.map((month) => ({
      billingMonth: month,
      label: monthLabel(month),
      rentPaise: 0,
      electricityPaise: 0,
      lateFeePaise: 0,
      otherIncomePaise: 0,
      operatingRevenuePaise: 0,
      source: 'financial_engine' as const,
    })),
    occupancyTrend: months.map((month) => ({
      billingMonth: month,
      label: monthLabel(month),
      occupancyPct: 0,
      source: 'estimated' as const,
    })),
    revenueByPgMonth: months.slice(-6).map((month) => ({ billingMonth: month, byPg: {} })),
    revenueMomPct: null,
    priorMonthCollectionRatePct: null,
  };
}

export async function loadOwnerDashboardTrends(
  billingMonthInput: string,
  pgIds: string[],
): Promise<OwnerDashboardTrends> {
  const billingMonth = firstOfMonth(billingMonthInput);
  const months = lastMonths(billingMonth, 12);

  let materialized: Array<{
    pgId: string;
    billingMonth: string | Date;
    snapshot: unknown;
  }> = [];

  try {
    materialized =
      pgIds.length > 0
        ? await db
            .select({
              pgId: businessMetricsIndex.pgId,
              billingMonth: businessMetricsIndex.billingMonth,
              snapshot: businessMetricsIndex.snapshot,
            })
            .from(businessMetricsIndex)
            .where(
              and(
                inArray(businessMetricsIndex.pgId, pgIds),
                inArray(businessMetricsIndex.billingMonth, months),
              ),
            )
        : [];
  } catch (err) {
    console.error('[owner-dashboard-trends] materialized query failed', err);
    materialized = [];
  }

  const byPgMonth = new Map<string, Map<string, OwnerPgMonthRevenue>>();
  const portfolioByMonth = new Map<
    string,
    {
      rent: number;
      electricity: number;
      lateFee: number;
      other: number;
      operating: number;
      occupancySum: number;
      occupancyWeight: number;
      pgCount: number;
    }
  >();

  for (const month of months) {
    portfolioByMonth.set(month, {
      rent: 0,
      electricity: 0,
      lateFee: 0,
      other: 0,
      operating: 0,
      occupancySum: 0,
      occupancyWeight: 0,
      pgCount: 0,
    });
    byPgMonth.set(month, new Map());
  }

  for (const row of materialized) {
    const fin = finRollupFromSnapshot(row.snapshot);
    if (!fin) continue;

    const monthKey = formatDate(parseDate(String(row.billingMonth)));
    const pgMap = byPgMonth.get(monthKey);
    if (pgMap) {
      pgMap.set(row.pgId, { operatingRevenuePaise: fin.operatingRevenuePaise });
    }
    const agg = portfolioByMonth.get(monthKey);
    if (agg) {
      agg.rent += fin.rentPrincipalPaise;
      agg.electricity += fin.electricityPaise;
      agg.lateFee += fin.lateFeePaise;
      agg.other += fin.otherIncomePaise;
      agg.operating += fin.operatingRevenuePaise;
      if (fin.totalBeds > 0) {
        agg.occupancySum += fin.occupancyPct * fin.totalBeds;
        agg.occupancyWeight += fin.totalBeds;
      }
      agg.pgCount += 1;
    }
  }

  const fallbackByMonth = new Map<string, FinRollup>();
  const monthsNeedingFallback = months.filter((month) => (portfolioByMonth.get(month)?.pgCount ?? 0) === 0);

  await Promise.all(
    monthsNeedingFallback.map(async (month) => {
      fallbackByMonth.set(month, await loadFinancialFallback(month));
    }),
  );

  const revenueTrend: OwnerRevenueTrendPoint[] = [];
  const occupancyTrend: OwnerOccupancyTrendPoint[] = [];

  for (const month of months) {
    const agg = portfolioByMonth.get(month)!;
    const hasRoomOs = agg.pgCount > 0;

    if (hasRoomOs) {
      revenueTrend.push({
        billingMonth: month,
        label: monthLabel(month),
        rentPaise: agg.rent,
        electricityPaise: agg.electricity,
        lateFeePaise: agg.lateFee,
        otherIncomePaise: agg.other,
        operatingRevenuePaise: agg.operating,
        source: 'room_os',
      });
      const occPct =
        agg.occupancyWeight > 0 ? Math.round(agg.occupancySum / agg.occupancyWeight) : 0;
      occupancyTrend.push({
        billingMonth: month,
        label: monthLabel(month),
        occupancyPct: occPct,
        source: 'room_os',
      });
    } else {
      const fin = fallbackByMonth.get(month) ?? ZERO_FIN;
      revenueTrend.push({
        billingMonth: month,
        label: monthLabel(month),
        rentPaise: fin.rentPrincipalPaise,
        electricityPaise: fin.electricityPaise,
        lateFeePaise: fin.lateFeePaise,
        otherIncomePaise: fin.otherIncomePaise,
        operatingRevenuePaise: fin.operatingRevenuePaise,
        source: 'financial_engine',
      });
      occupancyTrend.push({
        billingMonth: month,
        label: monthLabel(month),
        occupancyPct: fin.occupancyPct,
        source: 'estimated',
      });
    }
  }

  const revenueByPgMonth = months.slice(-6).map((month) => ({
    billingMonth: month,
    byPg: Object.fromEntries(byPgMonth.get(month)?.entries() ?? []),
  }));

  const currentIdx = revenueTrend.length - 1;
  const priorIdx = revenueTrend.length - 2;
  const currentRev = revenueTrend[currentIdx]?.operatingRevenuePaise ?? 0;
  const priorRev = revenueTrend[priorIdx]?.operatingRevenuePaise ?? 0;
  const revenueMomPct =
    priorRev > 0 ? Math.round(((currentRev - priorRev) / priorRev) * 1000) / 10 : null;

  let priorMonthCollectionRatePct: number | null = null;
  if (priorIdx >= 0) {
    const priorMonth = months[priorIdx]!;
    const priorFin = fallbackByMonth.get(priorMonth) ?? (await loadFinancialFallback(priorMonth));
    priorMonthCollectionRatePct = priorFin.operatingRevenuePaise > 0 ? 100 : 0;
  }

  return {
    billingMonth,
    pgIds,
    revenueTrend,
    occupancyTrend,
    revenueByPgMonth,
    revenueMomPct,
    priorMonthCollectionRatePct,
  };
}
