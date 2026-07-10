import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';
import { FEATURED_PG_PATTERNS } from '@/src/lib/admin/featuredPgs';
import { moduleHref, withMonth } from '@/src/lib/admin/navigation';
import type { RevenueByPgRow } from '@/src/services/revenueCommandCenter';
import type { OverviewReportingSnapshot } from '@/src/services/overviewReportingService';
import type { ExecutiveMetrics } from '@/src/services/executiveMetrics';

export type MetricKind = 'money' | 'count' | 'percent';

export type OverviewMetric = {
  id: string;
  label: string;
  kind: MetricKind;
  value: number;
  href?: string;
  hint?: string;
};

export type OverviewSection = {
  id: string;
  emoji: string;
  title: string;
  metrics: OverviewMetric[];
};

export type PropertyPerformanceRow = {
  pgId: string;
  pgName: string;
  totalRevenuePaise: number;
  rentRevenuePaise: number;
  electricityRevenuePaise: number;
  depositRevenuePaise: number;
  occupancyPct: number;
  occupiedBeds: number;
  totalBeds: number;
  href: string;
};

export type OverviewDashboardData = {
  billingMonth: string;
  monthLabel: string;
  sections: OverviewSection[];
  propertyPerformance: PropertyPerformanceRow[];
  operationsAlerts: OverviewMetric[];
};

export { FEATURED_PG_PATTERNS };

function metric(
  id: string,
  label: string,
  kind: MetricKind,
  value: number,
  opts: { href?: string; hint?: string } = {},
): OverviewMetric {
  return { id, label, kind, value, ...opts };
}

function moneyMetric(
  id: string,
  label: string,
  paise: number,
  opts: { href?: string; hint?: string } = {},
): OverviewMetric {
  return metric(id, label, 'money', paise, opts);
}

function countMetric(
  id: string,
  label: string,
  count: number,
  opts: { href?: string; hint?: string } = {},
): OverviewMetric {
  return metric(id, label, 'count', count, opts);
}

function percentMetric(
  id: string,
  label: string,
  pct: number,
  opts: { href?: string; hint?: string } = {},
): OverviewMetric {
  return metric(id, label, 'percent', pct, opts);
}

/** Pick one PG row per featured name pattern (first match wins). */
export function selectFeaturedPropertyRows(
  rows: RevenueByPgRow[],
  billingMonth: string,
  patterns = FEATURED_PG_PATTERNS,
): PropertyPerformanceRow[] {
  const used = new Set<string>();
  const result: PropertyPerformanceRow[] = [];

  for (const pattern of patterns) {
    const row = rows.find((r) => !used.has(r.pgId) && pattern.match(r.pgName));
    if (!row) continue;
    used.add(row.pgId);
    result.push(toPropertyPerformanceRow(row, billingMonth));
  }

  if (result.length === 0) {
    return rows.slice(0, 4).map((row) => toPropertyPerformanceRow(row, billingMonth));
  }

  return result;
}

function toPropertyPerformanceRow(row: RevenueByPgRow, billingMonth: string): PropertyPerformanceRow {
  return {
    pgId: row.pgId,
    pgName: row.pgName,
    totalRevenuePaise: row.totalRevenuePaise,
    rentRevenuePaise: row.rentRevenuePaise,
    electricityRevenuePaise: row.electricityRevenuePaise,
    depositRevenuePaise: row.depositCollectedPaise,
    occupancyPct: row.occupancyPct,
    occupiedBeds: row.occupiedBeds,
    totalBeds: row.totalBeds,
    href: withMonth(`/admin/revenue/pg/${row.pgId}`, billingMonth),
  };
}

function opsCount(
  counts: OverviewReportingSnapshot['operationsQueueCounts'],
  filter: keyof OverviewReportingSnapshot['operationsQueueCounts'],
): number {
  return counts[filter] ?? 0;
}

/** Pure mapping from reporting snapshot to dashboard cards — no business logic. */
export function buildOverviewDashboard(
  ctx: OverviewReportingSnapshot,
  executive?: ExecutiveMetrics | null,
): OverviewDashboardData {
  const month = ctx.billingMonth;
  const r = ctx.revenue;
  const out = r.outstanding;
  const rentStats = ctx.rentStats;
  const d = ctx.dashboard;
  const exec = executive;
  const visitors = ctx.visitors;
  const ops = ctx.operationsQueueCounts;
  const moveOut = ctx.moveOutPipeline;

  const sections: OverviewSection[] = [
    {
      id: 'money_today',
      emoji: '💰',
      title: 'MONEY TODAY',
      metrics: [
        moneyMetric('today_total', 'Total Revenue Today', r.today.totalPaise, {
          href: moduleHref('revenue', month),
        }),
        moneyMetric('today_rent', 'Rent Collected Today', r.today.rentPaise, {
          href: '/admin/billing?tab=paid',
        }),
        moneyMetric('today_electricity', 'Electricity Collected Today', r.today.electricityPaise, {
          href: '/admin/billing?tab=electricity',
        }),
        moneyMetric('today_deposit', 'Deposits Collected Today', r.today.depositPaise, {
          href: '/admin/deposits/collected',
        }),
      ],
    },
    {
      id: 'mtd',
      emoji: '📅',
      title: 'MONTH TO DATE (MTD)',
      metrics: [
        moneyMetric('mtd_total', 'Total Collected (MTD)', r.mtd.totalPaise, {
          href: moduleHref('revenue', month),
          hint: ctx.monthLabel,
        }),
        moneyMetric('mtd_rent', 'Rent Collected (MTD)', r.mtd.rentPaise, {
          href: moduleHref('revenue', month),
        }),
        moneyMetric('mtd_electricity', 'Electricity Collected (MTD)', r.mtd.electricityPaise, {
          href: '/admin/billing?tab=electricity',
        }),
        moneyMetric('mtd_deposit', 'Deposit Collected (MTD)', r.mtd.depositPaise, {
          href: withMonth('/admin/deposits/collected', month),
        }),
        moneyMetric('extra_income', 'Extra Income', r.mtd.otherIncomePaise, {
          href: moduleHref('revenue', month),
          hint: 'Non-rent invoice income',
        }),
        moneyMetric('late_fees', 'Late Fees Collected', r.mtd.lateFeePaise, {
          href: moduleHref('revenue', month),
        }),
      ],
    },
    {
      id: 'invoices_collections',
      emoji: '🧾',
      title: 'INVOICES & COLLECTIONS',
      metrics: [
        moneyMetric('pending_rent', 'Rent Pending', out.pendingRentInvoicesPaise, {
          href: '/admin/billing?tab=rent',
          hint: `${out.pendingRentInvoices} invoice${out.pendingRentInvoices === 1 ? '' : 's'}`,
        }),
        countMetric('overdue_rent', 'Rent Overdue', rentStats?.overdueCount ?? 0, {
          href: '/admin/billing?tab=rent',
        }),
        countMetric('paid_rent', 'Rent Paid', rentStats?.paidCount ?? 0, {
          href: '/admin/billing?tab=paid',
          hint: rentStats ? `₹${(rentStats.collectedPaise / 100).toLocaleString('en-IN')}` : undefined,
        }),
        moneyMetric('pending_electricity', 'Electricity Pending', out.pendingElectricityInvoicesPaise, {
          href: '/admin/billing?tab=electricity',
          hint: `${out.pendingElectricityInvoices} invoice${out.pendingElectricityInvoices === 1 ? '' : 's'}`,
        }),
        moneyMetric('total_outstanding', 'Total Outstanding', out.totalOutstandingPaise, {
          href: moduleHref('collections', month),
        }),
      ],
    },
    {
      id: 'operations',
      emoji: '⚡',
      title: 'OPERATIONS',
      metrics: [
        countMetric('rent_due', 'Rent Due', opsCount(ops, 'rent_due'), {
          href: operationsFilterHref('rent_due'),
        }),
        countMetric('electricity_due', 'Electricity Due', opsCount(ops, 'electricity_due'), {
          href: operationsFilterHref('electricity_due'),
        }),
        countMetric('deposit_due', 'Deposit Due', opsCount(ops, 'deposit_due'), {
          href: operationsFilterHref('deposit_due'),
        }),
        countMetric('refund_due', 'Refund Due', opsCount(ops, 'refund_due'), {
          href: operationsFilterHref('refund_due'),
        }),
        countMetric('waiting_for_approval', 'Waiting for Approval', opsCount(ops, 'waiting_for_approval'), {
          href: operationsFilterHref('waiting_for_approval'),
        }),
        countMetric('vacating_requests', 'Vacating Requests', opsCount(ops, 'vacating_requests'), {
          href: operationsFilterHref('vacating_requests'),
        }),
        countMetric('booking_approval', 'Booking Approval', opsCount(ops, 'booking_approval'), {
          href: operationsFilterHref('booking_approval'),
        }),
        countMetric('kyc_review', 'KYC Review', opsCount(ops, 'kyc_review'), {
          href: operationsFilterHref('kyc_review'),
        }),
      ],
    },
    {
      id: 'moveouts',
      emoji: '🏠',
      title: 'MOVE-OUTS',
      metrics: [
        countMetric('beds_releasing', 'Beds releasing (30d)', moveOut.counts.bedsReleasing30Days, {
          href: '/admin/vacating',
        }),
      ],
    },
    {
      id: 'occupancy_inventory',
      emoji: '🛏',
      title: 'OCCUPANCY & INVENTORY',
      metrics: [
        percentMetric('occupancy', 'Occupancy', exec?.occupancyPct ?? d?.occupancyPct ?? 0, {
          href: '/admin/occupancy',
          hint: `${exec?.occupiedBeds ?? d?.occupiedBeds ?? 0}/${exec?.totalBeds ?? d?.totalBeds ?? 0} beds`,
        }),
        countMetric('occupied_beds', 'Occupied Beds', exec?.occupiedBeds ?? d?.occupiedBeds ?? 0, {
          href: '/admin/occupancy',
        }),
        countMetric('vacant_beds', 'Vacant Beds', exec?.vacantBeds ?? d?.availableBeds ?? 0, {
          href: '/admin/beds',
        }),
        countMetric('reserved_beds', 'Reserved Beds', exec?.reservedBeds ?? 0, {
          href: '/admin/occupancy',
        }),
        countMetric('bed_availability', 'Bed Availability', d?.availableBeds ?? 0, {
          href: '/admin/beds',
        }),
        countMetric('blocked_beds', 'Blocked Beds', d?.blockedBeds ?? 0, {
          href: '/admin/beds',
        }),
        countMetric('maintenance_beds', 'Maintenance Beds', d?.maintenanceBeds ?? 0, {
          hint: 'Beds marked under maintenance on the PG map',
        }),
        moneyMetric('deposit_liability', 'Deposit Liability', exec?.depositLiabilityPaise ?? 0, {
          href: '/admin/deposits',
        }),
        countMetric('move_ins_month', 'Move-ins this month', exec?.moveInsThisMonth ?? 0, {
          href: '/admin/bookings',
        }),
        countMetric('move_outs_month', 'Move-outs this month', exec?.moveOutsThisMonth ?? 0, {
          href: '/admin/vacating',
        }),
      ],
    },
    {
      id: 'residents',
      emoji: '👥',
      title: 'RESIDENTS',
      metrics: [
        countMetric('active_tenants', 'Active Tenants', ctx.activeTenants, {
          href: '/admin/residents',
        }),
        countMetric('upcoming_checkins', 'Upcoming Check-ins', ctx.upcomingCheckins, {
          href: '/admin/bookings',
        }),
      ],
    },
    {
      id: 'website_analytics',
      emoji: '🌐',
      title: 'WEBSITE ANALYTICS',
      metrics: [
        countMetric('visitors_all', 'Website Visitors', visitors.allTime, {
          href: moduleHref('analytics', month),
          hint: `${visitors.uniqueAllTime} unique`,
        }),
        countMetric('visitors_today', 'Visitors Today', visitors.today, {
          href: moduleHref('analytics', month),
          hint: `${visitors.uniqueToday} unique`,
        }),
        countMetric('visitors_week', 'Visitors This Week', visitors.week, {
          href: moduleHref('analytics', month),
        }),
        countMetric('visitors_month', 'Visitors This Month', visitors.month, {
          href: moduleHref('analytics', month),
        }),
      ],
    },
    {
      id: 'property_portfolio',
      emoji: '🏢',
      title: 'PROPERTY PORTFOLIO',
      metrics: [
        countMetric('active_pgs', 'Active PGs', d?.totalPgs ?? ctx.pgCount, {
          href: '/admin/pgs',
        }),
        countMetric('floors', 'Floors', d?.totalFloors ?? 0, {
          href: '/admin/floors',
        }),
        countMetric('rooms', 'Rooms', d?.totalRooms ?? 0, {
          href: '/admin/rooms',
        }),
        countMetric('total_beds', 'Total Beds', d?.totalBeds ?? 0, {
          href: '/admin/beds',
        }),
      ],
    },
  ];

  const propertyPerformance = selectFeaturedPropertyRows(r.byPg, month);

  return {
    billingMonth: month,
    monthLabel: ctx.monthLabel,
    sections,
    propertyPerformance,
    operationsAlerts: [],
  };
}

export function formatOverviewMetricValue(kind: MetricKind, value: number): string {
  switch (kind) {
    case 'money':
      return `₹${(value / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    case 'percent':
      return `${value}%`;
    case 'count':
      return value.toLocaleString('en-IN');
  }
}

/** Read a card value from a built dashboard — for parity scripts. */
export function findOverviewMetricValue(
  dashboard: OverviewDashboardData,
  id: string,
): number | null {
  for (const section of dashboard.sections) {
    const m = section.metrics.find((x) => x.id === id);
    if (m) return m.value;
  }
  return null;
}
