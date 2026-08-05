/**
 * Owner Dashboard (CEO Overview) — pure presentation mapper from overview snapshot.
 */

import { moduleHref, withMonth } from '@/src/lib/admin/navigation';
import type { ExecutiveMetrics } from '@/src/services/executiveMetrics';
import type { OverviewReportingSnapshot } from '@/src/services/overviewReportingService';
import type { RevenueByPgRow } from '@/src/services/revenueCommandCenter';
import type { OwnerDashboardTrends } from '@/src/services/ownerDashboardTrends';

export type OwnerKpiKind = 'money' | 'count' | 'percent';

export type OwnerKpi = {
  id: string;
  label: string;
  kind: OwnerKpiKind;
  value: number;
  href?: string;
  hint?: string;
  trendPct?: number | null;
  trendLabel?: string;
  accent?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'orange';
};

export type OwnerChartSlice = {
  id: string;
  label: string;
  paise: number;
  color: string;
};

export type OwnerPgCard = {
  pgId: string;
  pgName: string;
  href: string;
  occupancyPct: number;
  occupiedBeds: number;
  totalBeds: number;
  operatingRevenuePaise: number;
  outstandingPaise: number;
  depositHeldPaise: number;
  collectionPct: number;
  sparklineRevenuePaise: number[];
};

export type OwnerActionItem = {
  id: string;
  label: string;
  count: number;
  href: string;
};

export type OwnerOccupancyDistribution = {
  occupied: number;
  vacant: number;
  reserved: number;
  maintenance: number;
  moveOut: number;
};

export type OwnerDashboardData = {
  billingMonth: string;
  monthLabel: string;
  kpis: OwnerKpi[];
  revenueComposition: {
    rentPaise: number;
    electricityPaise: number;
    lateFeePaise: number;
    otherIncomePaise: number;
  };
  collectionStatus: OwnerChartSlice[];
  collectionRatePct: number;
  collectionRateDeltaPct: number | null;
  revenueByPg: RevenueByPgRow[];
  occupancyDistribution: OwnerOccupancyDistribution;
  pgCards: OwnerPgCard[];
  actions: OwnerActionItem[];
  pgIds: string[];
  trends?: OwnerDashboardTrends;
  ecosystemHealth?: EcosystemHealthSnapshot | null;
};

export type EcosystemHealthSnapshot = {
  overallHealthPct: number;
  brainHealthPct: number;
  productionIntegrityPct: number;
  openIssues: number;
  autoRepairsToday: number;
  manualRepairsRequired: number;
  lastAuditAt: string | null;
  lastRepairAt: string | null;
  lastCriticalCause: string | null;
  byBrain: Array<{
    brain: string;
    status: 'Healthy' | 'Warning' | 'Critical';
    openP0: number;
    openP1: number;
    openP2: number;
  }>;
};

function outstandingByPg(ctx: OverviewReportingSnapshot): Map<string, number> {
  const map = new Map<string, number>();
  const rentWaiting = ctx.invoiceSnapshot?.rentWaiting ?? [];
  const electricityWaiting = ctx.invoiceSnapshot?.electricityWaiting ?? [];
  for (const row of rentWaiting) {
    map.set(row.pgId, (map.get(row.pgId) ?? 0) + row.outstandingPaise);
  }
  for (const row of electricityWaiting) {
    map.set(row.pgId, (map.get(row.pgId) ?? 0) + row.outstandingPaise);
  }
  return map;
}

function collectionRate(mtdCollectedPaise: number, outstandingPaise: number): number {
  const denom = mtdCollectedPaise + outstandingPaise;
  if (denom <= 0) return 0;
  return Math.round((mtdCollectedPaise / denom) * 1000) / 10;
}

function buildPgCards(
  rows: RevenueByPgRow[],
  outstandingMap: Map<string, number>,
  billingMonth: string,
  sparklinesByPg: Map<string, number[]>,
): OwnerPgCard[] {
  return rows.map((row) => {
    const outstandingPaise = outstandingMap.get(row.pgId) ?? 0;
    const collected = row.totalRevenuePaise;
    const collectionPct =
      collected + outstandingPaise > 0
        ? Math.round((collected / (collected + outstandingPaise)) * 1000) / 10
        : 0;

    return {
      pgId: row.pgId,
      pgName: row.pgName,
      href: withMonth(`/admin/revenue/pg/${row.pgId}`, billingMonth),
      occupancyPct: row.occupancyPct,
      occupiedBeds: row.occupiedBeds,
      totalBeds: row.totalBeds,
      operatingRevenuePaise: row.totalRevenuePaise,
      outstandingPaise,
      depositHeldPaise: row.depositHeldPaise ?? 0,
      collectionPct,
      sparklineRevenuePaise: sparklinesByPg.get(row.pgId) ?? [],
    };
  });
}

function sparklinesFromTrends(trends: OwnerDashboardTrends | undefined): Map<string, number[]> {
  const map = new Map<string, number[]>();
  if (!trends) return map;
  for (const pgId of trends.pgIds) {
    map.set(
      pgId,
      trends.revenueByPgMonth.map((month) => month.byPg[pgId]?.operatingRevenuePaise ?? 0),
    );
  }
  return map;
}

/** Pure mapper — no DB. */
export function buildOwnerDashboard(
  ctx: OverviewReportingSnapshot,
  executive?: ExecutiveMetrics | null,
  trends?: OwnerDashboardTrends,
): OwnerDashboardData {
  const month = ctx.billingMonth;
  const r = ctx.revenue;
  const out = r.outstanding;
  const rentStats = ctx.rentStats;
  const d = ctx.dashboard;
  const exec = executive;
  const depositHeld = r.depositPortfolio.heldPaise;

  const occupancyPct = exec?.occupancyPct ?? d?.occupancyPct ?? 0;
  const occupiedBeds = exec?.occupiedBeds ?? d?.occupiedBeds ?? 0;
  const totalBeds = exec?.totalBeds ?? d?.totalBeds ?? 0;

  const rateNow = collectionRate(r.mtd.totalPaise, out.totalOutstandingPaise);
  const ratePrior =
    trends?.priorMonthCollectionRatePct != null ? trends.priorMonthCollectionRatePct : null;
  const rateDelta =
    ratePrior != null ? Math.round((rateNow - ratePrior) * 10) / 10 : null;

  const revenueMomPct = trends?.revenueMomPct ?? null;

  const outstandingMap = outstandingByPg(ctx);
  const sparklines = sparklinesFromTrends(trends);

  const kpis: OwnerKpi[] = [
    {
      id: 'operating_revenue_mtd',
      label: 'Operating Revenue (MTD)',
      kind: 'money',
      value: r.mtd.totalPaise,
      href: moduleHref('revenue', month),
      hint: ctx.monthLabel,
      trendPct: revenueMomPct,
      trendLabel: revenueMomPct != null ? 'vs last month' : undefined,
      accent: 'orange',
    },
    {
      id: 'security_deposits_held',
      label: 'Security Deposits Held',
      kind: 'money',
      value: depositHeld,
      href: '/admin/deposits',
      hint: 'Total liability · live ledger balance',
      accent: 'violet',
    },
    {
      id: 'occupancy',
      label: 'Occupancy',
      kind: 'percent',
      value: occupancyPct,
      href: '/admin/analytics',
      hint: `${occupiedBeds}/${totalBeds} beds occupied`,
      accent: 'indigo',
    },
    {
      id: 'outstanding_collections',
      label: 'Outstanding Collections',
      kind: 'money',
      value: out.totalOutstandingPaise,
      href: moduleHref('collections', month),
      hint:
        rentStats && rentStats.overdueCount > 0
          ? `${rentStats.overdueCount} overdue invoice${rentStats.overdueCount === 1 ? '' : 's'}`
          : undefined,
      trendPct: rateDelta,
      trendLabel: rateDelta != null ? 'collection rate vs prior month' : undefined,
      accent: 'rose',
    },
    {
      id: 'collection_rate',
      label: 'Collection Rate',
      kind: 'percent',
      value: rateNow,
      href: moduleHref('collections', month),
      hint: rateDelta != null ? `${rateDelta >= 0 ? '+' : ''}${rateDelta}% vs prior month` : ctx.monthLabel,
      accent: 'emerald',
    },
    {
      id: 'active_pgs',
      label: 'Active PGs',
      kind: 'count',
      value: (r.byPg ?? []).length || ctx.pgCount || 0,
      href: '/admin/pgs',
      accent: 'sky',
    },
  ];

  const mtdCollected = r.mtd.totalPaise;
  const overdueEstimatePaise = Math.min(
    out.totalOutstandingPaise,
    rentStats?.outstandingPaise ?? out.pendingRentInvoicesPaise,
  );

  const collectionStatus: OwnerChartSlice[] = [
    { id: 'collected', label: 'Collected (MTD)', paise: mtdCollected, color: '#34D399' },
    { id: 'pending', label: 'Pending', paise: out.totalOutstandingPaise - overdueEstimatePaise, color: '#FBBF24' },
    { id: 'overdue', label: 'Overdue', paise: overdueEstimatePaise, color: '#F87171' },
  ].filter((s) => s.paise > 0);

  const pgCards = buildPgCards(r.byPg ?? [], outstandingMap, month, sparklines);

  return {
    billingMonth: month,
    monthLabel: ctx.monthLabel,
    kpis,
    revenueComposition: {
      rentPaise: r.mtd?.rentPaise ?? 0,
      electricityPaise: r.mtd?.electricityPaise ?? 0,
      lateFeePaise: r.mtd?.lateFeePaise ?? 0,
      otherIncomePaise: r.mtd?.otherIncomePaise ?? 0,
    },
    collectionStatus,
    collectionRatePct: rateNow,
    collectionRateDeltaPct: rateDelta,
    revenueByPg: r.byPg ?? [],
    occupancyDistribution: {
      occupied: occupiedBeds,
      vacant: exec?.vacantBeds ?? d?.availableBeds ?? 0,
      reserved: exec?.reservedBeds ?? 0,
      maintenance: d?.maintenanceBeds ?? 0,
      moveOut: ctx.moveOutPipeline?.counts?.bedsReleasing30Days ?? 0,
    },
    pgCards,
    actions: [],
    pgIds: (r.byPg ?? []).map((row) => row.pgId),
    trends,
    ecosystemHealth: null,
  };
}

export function formatOwnerKpiValue(kind: OwnerKpiKind, value: number): string {
  switch (kind) {
    case 'money':
      return `₹${(value / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    case 'percent':
      return `${value}%`;
    case 'count':
      return value.toLocaleString('en-IN');
  }
}
