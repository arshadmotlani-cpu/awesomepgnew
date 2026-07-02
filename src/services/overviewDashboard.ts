import { moduleHref, withMonth } from '@/src/lib/admin/navigation';
import type { RevenueByPgRow } from '@/src/services/revenueCommandCenter';
import type { OverviewContext } from '@/src/services/overviewData';

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

type FeaturedPgPattern = {
  label: string;
  match: (pgName: string) => boolean;
};

export const FEATURED_PG_PATTERNS: FeaturedPgPattern[] = [
  {
    label: 'CENTRAL - AWESOME PG',
    match: (name) => /central/i.test(name) && !/female/i.test(name),
  },
  {
    label: 'CENTRAL - AWESOME PG (Female)',
    match: (name) => /central/i.test(name) && /female/i.test(name),
  },
  {
    label: 'SHANTINAGAR - AWESOME PG',
    match: (name) => /shantinagar/i.test(name),
  },
  {
    label: 'TRIMURTI NAGAR - AWESOME PG',
    match: (name) => /trimurti/i.test(name),
  },
];

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
  patterns: FeaturedPgPattern[] = FEATURED_PG_PATTERNS,
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

export function buildOverviewDashboard(ctx: OverviewContext): OverviewDashboardData {
  const month = ctx.billingMonth;
  const s = ctx.summary;
  const r = ctx.revenue;
  const out = r.outstanding;
  const ops = ctx.operations;
  const d = ctx.dashboard;
  const rentStats = ctx.rentStats;
  const kpis = ctx.overviewKpis;
  const visitors = ctx.visitors;

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
        moneyMetric('mtd_rent', 'Rent Collected (MTD)', s.incomeRentPaise, {
          href: moduleHref('revenue', month),
        }),
        moneyMetric('mtd_electricity', 'Electricity Collected (MTD)', s.incomeElectricityPaise, {
          href: '/admin/billing?tab=electricity',
        }),
        moneyMetric('mtd_deposit', 'Deposit Collected (MTD)', r.mtd.depositPaise, {
          href: withMonth('/admin/deposits/collected', month),
        }),
        moneyMetric('extra_income', 'Extra Income', s.extraIncomePaise, {
          href: moduleHref('revenue', month),
          hint: 'Non-rent invoice income',
        }),
        moneyMetric('late_fees', 'Late Fees Collected', s.lateFeePaise, {
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
        moneyMetric('rent_outstanding', 'Rent Outstanding', rentStats?.outstandingPaise ?? 0, {
          href: '/admin/billing?tab=rent',
        }),
        moneyMetric('pending_electricity', 'Electricity Pending', out.pendingElectricityInvoicesPaise, {
          href: '/admin/billing?tab=electricity',
          hint: `${out.pendingElectricityInvoices} invoice${out.pendingElectricityInvoices === 1 ? '' : 's'}`,
        }),
        countMetric('electricity_due', 'Electricity Due', ops?.electricityPending.count ?? 0, {
          href: '/admin/billing?tab=electricity',
        }),
        moneyMetric('total_outstanding', 'Total Outstanding', out.totalOutstandingPaise, {
          href: moduleHref('collections', month),
        }),
      ],
    },
    {
      id: 'payments_approvals',
      emoji: '💳',
      title: 'PAYMENTS & APPROVALS',
      metrics: [
        countMetric('payments_to_review', 'Payments To Review', ops?.pendingPayments.count ?? 0, {
          href: '/admin/operations?filter=payment_proof',
          hint: 'SSOT: payment proof queue',
        }),
      ],
    },
    {
      id: 'moveouts_refunds',
      emoji: '🏠',
      title: 'MOVE-OUTS & REFUNDS',
      metrics: [
        countMetric('vacating_month', 'Move-out notices', ops?.leavingSoon.count ?? 0, {
          href: '/admin/vacating',
          hint: 'Pending or approved vacating requests',
        }),
        countMetric('beds_releasing', 'Beds releasing (30d)', ops?.bedsReleasingSoon.count ?? 0, {
          href: '/admin/vacating',
        }),
        countMetric(
          'refunds_pending',
          'Refunds pending',
          ops?.checkoutRefundsPending.count ?? 0,
          {
            href: '/admin/checkout-settlements?tab=refund_pending',
            hint: 'Checkout pipeline — refund to send',
          },
        ),
      ],
    },
    {
      id: 'occupancy_inventory',
      emoji: '🛏',
      title: 'OCCUPANCY & INVENTORY',
      metrics: [
        percentMetric('occupancy', 'Occupancy', s.occupancyPct, {
          href: '/admin/occupancy',
          hint: `${s.occupiedBeds}/${s.totalBeds} beds`,
        }),
        countMetric('occupied_beds', 'Occupied Beds', s.occupiedBeds, {
          href: '/admin/occupancy',
        }),
        countMetric('bed_availability', 'Bed Availability', s.availableBeds, {
          href: '/admin/beds',
        }),
        countMetric('blocked_beds', 'Blocked Beds', d?.blockedBeds ?? 0, {
          href: '/admin/beds',
        }),
        countMetric('maintenance_beds', 'Maintenance Beds', d?.maintenanceBeds ?? 0, {
          href: '/admin/beds',
        }),
      ],
    },
    {
      id: 'residents',
      emoji: '👥',
      title: 'RESIDENTS',
      metrics: [
        countMetric('active_tenants', 'Active Tenants', kpis.activeTenants, {
          href: '/admin/residents',
        }),
        countMetric('upcoming_checkins', 'Upcoming Check-ins', ops?.upcomingReservations.count ?? 0, {
          href: '/admin/bookings',
        }),
      ],
    },
    {
      id: 'compliance_kyc',
      emoji: '✅',
      title: 'COMPLIANCE & KYC',
      metrics: [
        countMetric('kyc_pending', 'KYC Pending', ops?.pendingKyc.count ?? 0, {
          href: '/admin/residents/kyc',
          hint: 'SSOT: pending KYC submissions',
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
        countMetric('total_beds', 'Total Beds', d?.totalBeds ?? s.totalBeds, {
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
