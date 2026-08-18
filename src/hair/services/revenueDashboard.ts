import { and, count, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAppointments,
  fyhCustomers,
  fyhFinancialLedger,
  fyhInvoiceLineAttributions,
  fyhInvoiceLines,
  fyhInvoices,
  fyhServices,
} from '@/src/hair/db/schema';
import { salonDayBounds, salonMonthStartUtc } from '@/src/hair/lib/salonTime';
import { getDashboardSnapshot } from '@/src/hair/services/dashboard';
import {
  getFinancialDashboardSnapshot,
  lastNDayKeys,
  type DailyRevenuePoint,
  type TopRevenueItem,
} from '@/src/hair/services/financialDashboard';
import { paymentMethodSplit, type PaymentMethodSplitRow } from '@/src/hair/services/reportQueries';
import { getReportsSnapshot, paidRevenueBetween } from '@/src/hair/services/reports';
import { getSalonSettings } from '@/src/hair/services/settings';
import { salonMetricTotal } from '@/src/hair/services/staffPerformance';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export type MonthlyRevenuePoint = {
  monthKey: string;
  label: string;
  revenuePaise: number;
};

export type CategoryRevenueRow = {
  category: string;
  revenuePaise: number;
};

export type HourlyRevenuePoint = {
  hour: number;
  label: string;
  revenuePaise: number;
};

export type HeatmapCell = {
  dayOfWeek: number;
  hour: number;
  revenuePaise: number;
};

export type SegmentCard = {
  category: string;
  revenuePaise: number;
  appointments: number;
  customers: number;
  outstandingPaise: number;
  growthPct: number | null;
  sparkline: number[];
};

export type RevenueDashboardSnapshot = {
  timezone: string;
  todayRevenuePaise: number;
  mtdRevenuePaise: number;
  outstandingDuePaise: number;
  advanceLiabilityPaise: number;
  cashCollectedPaise: number;
  upiCollectedPaise: number;
  cardCollectedPaise: number;
  walletBalancePaise: number;
  averageBillTodayPaise: number;
  averageBillMtdPaise: number;
  invoicesToday: number;
  appointmentsToday: number;
  trend30Days: DailyRevenuePoint[];
  trend12Months: MonthlyRevenuePoint[];
  revenueByService: TopRevenueItem[];
  revenueByCategory: CategoryRevenueRow[];
  revenueByStaff: TopRevenueItem[];
  paymentMethodBreakdown: PaymentMethodSplitRow[];
  outstandingTrend30: DailyRevenuePoint[];
  averageBillTrend30: { dayKey: string; avgPaise: number }[];
  hourlyRevenueToday: HourlyRevenuePoint[];
  revenueHeatmap: HeatmapCell[];
  topServices: TopRevenueItem[];
  topProducts: TopRevenueItem[];
  customersToday: number;
  repeatCustomersToday: number;
  newCustomersToday: number;
  appointmentConversionPct: number;
  cancellationRatePct: number;
  noShowRatePct: number;
  averageCustomerSpendPaise: number;
  servicesRevenuePaise: number;
  productsRevenuePaise: number;
  membershipRevenuePaise: number;
  packagesRevenuePaise: number;
  giftCardsRevenuePaise: number;
  refundsPaise: number;
  discountsPaise: number;
  netRevenuePaise: number;
  grossRevenuePaise: number;
  segmentCards: SegmentCard[];
};

function monthLabel(monthKey: string, timezone: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    month: 'short',
    year: '2-digit',
  }).format(new Date(Date.UTC(y, m - 1, 15)));
}

async function monthlyRevenueRollup(
  timezone: string,
  months = 12,
): Promise<MonthlyRevenuePoint[]> {
  const { dayKey } = salonDayBounds(timezone);
  const [y, m] = dayKey.split('-').map(Number);
  const points: MonthlyRevenuePoint[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const anchor = new Date(Date.UTC(y, m - 1 - i, 1));
    const yy = anchor.getUTCFullYear();
    const mm = anchor.getUTCMonth() + 1;
    const monthKey = `${yy}-${String(mm).padStart(2, '0')}`;
    const from = salonMonthStartUtc(timezone, new Date(Date.UTC(yy, mm - 1, 15)));
    const next = new Date(Date.UTC(yy, mm, 1));
    const to = salonMonthStartUtc(timezone, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), 15)));
    const { revenuePaise } = await paidRevenueBetween(from, to);
    points.push({ monthKey, label: monthLabel(monthKey, timezone), revenuePaise });
  }
  return points;
}

async function revenueByCategoryBetween(from: Date, to: Date): Promise<CategoryRevenueRow[]> {
  const rows = await hairDb
    .select({
      category: fyhServices.category,
      total: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .leftJoin(fyhServices, eq(fyhServices.id, fyhInvoiceLines.serviceId))
    .where(
      and(
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, from),
        lt(fyhInvoices.paidAt, to),
      ),
    )
    .groupBy(fyhServices.category)
    .orderBy(sql`sum(${fyhInvoiceLineAttributions.attributedNetPaise}) desc`);

  return rows.map((r) => ({
    category: r.category?.trim() || 'Uncategorized',
    revenuePaise: Number(r.total ?? 0),
  }));
}

async function averageBillBetween(from: Date, to: Date): Promise<number> {
  const [row] = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhInvoices.grandTotalPaise}), 0)::bigint`,
      c: sql<number>`count(*)::int`,
    })
    .from(fyhInvoices)
    .where(
      and(eq(fyhInvoices.status, 'paid'), gte(fyhInvoices.paidAt, from), lt(fyhInvoices.paidAt, to)),
    );
  const c = Number(row?.c ?? 0);
  return c > 0 ? Math.round(Number(row?.total ?? 0) / c) : 0;
}

async function invoiceBreakdownMtd(from: Date, to: Date) {
  const [row] = await hairDb
    .select({
      gross: sql<number>`coalesce(sum(${fyhInvoices.grandTotalPaise}), 0)::bigint`,
      discount: sql<number>`coalesce(sum(${fyhInvoices.discountPaise}), 0)::bigint`,
      gift: sql<number>`coalesce(sum(${fyhInvoices.giftCardRedemptionPaise}), 0)::bigint`,
      refunded: sql<number>`coalesce(sum(case when ${fyhInvoices.status} = 'refunded' then ${fyhInvoices.grandTotalPaise} else 0 end), 0)::bigint`,
    })
    .from(fyhInvoices)
    .where(
      and(
        sql`${fyhInvoices.status} in ('paid', 'refunded')`,
        gte(fyhInvoices.paidAt, from),
        lt(fyhInvoices.paidAt, to),
      ),
    );
  const gross = Number(row?.gross ?? 0);
  const discount = Number(row?.discount ?? 0);
  return {
    grossRevenuePaise: gross,
    discountsPaise: discount,
    giftCardsRevenuePaise: Number(row?.gift ?? 0),
    refundsPaise: Number(row?.refunded ?? 0),
    netRevenuePaise: Math.max(0, gross - discount),
  };
}

async function businessHealthToday(start: Date, end: Date) {
  const apptRows = await hairDb
    .select({
      status: fyhAppointments.status,
      customerId: fyhAppointments.customerId,
      c: count(),
    })
    .from(fyhAppointments)
    .where(and(gte(fyhAppointments.startAt, start), lt(fyhAppointments.startAt, end)))
    .groupBy(fyhAppointments.status, fyhAppointments.customerId);

  let total = 0;
  let cancelled = 0;
  let noShow = 0;
  let completed = 0;
  const customerIds = new Set<string>();
  for (const r of apptRows) {
    const n = Number(r.c ?? 0);
    total += n;
    if (r.status === 'cancelled') cancelled += n;
    if (r.status === 'no_show') noShow += n;
    if (r.status === 'completed' || r.status === 'paid') completed += n;
    if (r.customerId) customerIds.add(r.customerId);
  }

  let repeat = 0;
  let newCust = 0;
  if (customerIds.size > 0) {
    const ids = [...customerIds];
    const custRows = await hairDb
      .select({
        id: fyhCustomers.id,
        visits: fyhCustomers.totalVisits,
      })
      .from(fyhCustomers)
      .where(inArray(fyhCustomers.id, ids));
    for (const c of custRows) {
      if (Number(c.visits ?? 0) > 1) repeat += 1;
      else newCust += 1;
    }
  }

  const denom = total || 1;
  return {
    customersToday: customerIds.size,
    repeatCustomersToday: repeat,
    newCustomersToday: newCust,
    appointmentConversionPct: Math.round((completed / denom) * 100),
    cancellationRatePct: Math.round((cancelled / denom) * 100),
    noShowRatePct: Math.round((noShow / denom) * 100),
  };
}

async function hourlyRevenueToday(start: Date, end: Date, timezone: string): Promise<HourlyRevenuePoint[]> {
  const rows = await hairDb
    .select({ paidAt: fyhInvoices.paidAt, total: fyhInvoices.grandTotalPaise })
    .from(fyhInvoices)
    .where(and(eq(fyhInvoices.status, 'paid'), gte(fyhInvoices.paidAt, start), lt(fyhInvoices.paidAt, end)));

  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    revenuePaise: 0,
  }));

  for (const row of rows) {
    if (!row.paidAt) continue;
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      }).format(row.paidAt),
    );
    if (hour >= 0 && hour < 24) {
      buckets[hour].revenuePaise += Number(row.total ?? 0);
    }
  }
  return buckets;
}

async function revenueHeatmap7d(timezone: string, endDayKey: string): Promise<HeatmapCell[]> {
  const dayKeys = lastNDayKeys(endDayKey, 7);
  const start = salonDayBounds(timezone, new Date(`${dayKeys[0]}T12:00:00Z`)).start;
  const end = salonDayBounds(timezone, new Date(`${endDayKey}T12:00:00Z`)).end;

  const rows = await hairDb
    .select({ paidAt: fyhInvoices.paidAt, total: fyhInvoices.grandTotalPaise })
    .from(fyhInvoices)
    .where(and(eq(fyhInvoices.status, 'paid'), gte(fyhInvoices.paidAt, start), lt(fyhInvoices.paidAt, end)));

  const cells: HeatmapCell[] = [];
  for (let d = 0; d < 7; d += 1) {
    for (let h = 0; h < 24; h += 1) {
      cells.push({ dayOfWeek: d, hour: h, revenuePaise: 0 });
    }
  }

  for (const row of rows) {
    if (!row.paidAt) continue;
    const dow = new Date(
      new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(row.paidAt),
    ).getDay();
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: 'numeric', hour12: false }).format(
        row.paidAt,
      ),
    );
    const idx = dow * 24 + hour;
    if (idx >= 0 && idx < cells.length) {
      cells[idx].revenuePaise += Number(row.total ?? 0);
    }
  }
  return cells;
}

async function outstandingTrend30(timezone: string, endDayKey: string): Promise<DailyRevenuePoint[]> {
  const dayKeys = lastNDayKeys(endDayKey, 30);
  const out: DailyRevenuePoint[] = dayKeys.map((dayKey) => ({ dayKey, revenuePaise: 0 }));

  try {
    for (let i = 0; i < dayKeys.length; i += 1) {
      const { start, end } = salonDayBounds(timezone, new Date(`${dayKeys[i]}T12:00:00Z`));
      const [row] = await hairDb
        .select({
          total: sql<number>`coalesce(sum(${fyhFinancialLedger.amountPaise}), 0)::bigint`,
        })
        .from(fyhFinancialLedger)
        .where(
          and(
            eq(fyhFinancialLedger.kind, 'receivable_settled'),
            gte(fyhFinancialLedger.createdAt, start),
            lt(fyhFinancialLedger.createdAt, end),
          ),
        );
      out[i].revenuePaise = Number(row?.total ?? 0);
    }
  } catch {
    // zero-filled
  }
  return out;
}

async function averageBillTrend30(timezone: string, endDayKey: string) {
  const dayKeys = lastNDayKeys(endDayKey, 30);
  const points: { dayKey: string; avgPaise: number }[] = [];
  for (const dayKey of dayKeys) {
    const { start, end } = salonDayBounds(timezone, new Date(`${dayKey}T12:00:00Z`));
    points.push({ dayKey, avgPaise: await averageBillBetween(start, end) });
  }
  return points;
}

async function buildSegmentCards(
  monthStart: Date,
  monthEnd: Date,
  prevMonthStart: Date,
  prevMonthEnd: Date,
): Promise<SegmentCard[]> {
  const [current, previous] = await Promise.all([
    revenueByCategoryBetween(monthStart, monthEnd),
    revenueByCategoryBetween(prevMonthStart, prevMonthEnd),
  ]);
  const prevMap = new Map(previous.map((r) => [r.category, r.revenuePaise]));

  return current.slice(0, 6).map((row) => {
    const prev = prevMap.get(row.category) ?? 0;
    const growthPct =
      prev > 0 ? Math.round(((row.revenuePaise - prev) / prev) * 100) : row.revenuePaise > 0 ? 100 : null;
    return {
      category: row.category,
      revenuePaise: row.revenuePaise,
      appointments: 0,
      customers: 0,
      outstandingPaise: 0,
      growthPct,
      sparkline: [prev, row.revenuePaise],
    };
  });
}

export type RevenueDashboardViewModel = RevenueDashboardSnapshot;

export function buildRevenueDashboard(raw: RevenueDashboardSnapshot): RevenueDashboardViewModel {
  return raw;
}

export async function getRevenueDashboardSnapshot(ctx?: TenantContext | null): Promise<RevenueDashboardSnapshot> {
  const settings = await getSalonSettings();
  const timezone = settings.timezone?.trim() || 'Asia/Kolkata';
  const { start, end, dayKey } = salonDayBounds(timezone);
  const monthStart = salonMonthStartUtc(timezone);
  const prevMonthEnd = monthStart;
  const prevMonthStart = salonMonthStartUtc(timezone, new Date(monthStart.getTime() - 86_400_000));

  const [financial, reports, ops, mtdSplit, mtdBreakdown] = await Promise.all([
    getFinancialDashboardSnapshot(),
    getReportsSnapshot(),
    getDashboardSnapshot(),
    paymentMethodSplit({ from: monthStart, to: end }),
    invoiceBreakdownMtd(monthStart, end),
  ]);

  const [
    trend12Months,
    revenueByCategory,
    revenueByStaff,
    hourlyToday,
    heatmap,
    outstandingTrend30Days,
    avgBillTrend30,
    health,
    avgBillToday,
    avgBillMtd,
    servicesRevenue,
    productsRevenue,
    membershipRevenue,
    packagesRevenue,
    segmentCards,
  ] = await Promise.all([
    monthlyRevenueRollup(timezone, 12),
    revenueByCategoryBetween(monthStart, end),
    Promise.resolve(
      financial.topStaffToday.length
        ? financial.topStaffToday
        : reports.topStaffThisMonth.map((s) => ({
            id: s.staffId,
            name: s.name,
            revenuePaise: s.revenuePaise,
          })),
    ),
    hourlyRevenueToday(start, end, timezone),
    revenueHeatmap7d(timezone, dayKey),
    outstandingTrend30(timezone, dayKey),
    averageBillTrend30(timezone, dayKey),
    businessHealthToday(start, end),
    averageBillBetween(start, end),
    averageBillBetween(monthStart, end),
    salonMetricTotal('service', { from: monthStart, to: end }),
    salonMetricTotal('product', { from: monthStart, to: end }),
    salonMetricTotal('membership', { from: monthStart, to: end }),
    salonMetricTotal('package', { from: monthStart, to: end }),
    buildSegmentCards(monthStart, end, prevMonthStart, prevMonthEnd),
  ]);

  const mtdCollections = financial.todayCollectionsByMethod;
  const averageCustomerSpend =
    health.customersToday > 0
      ? Math.round(financial.todayRevenuePaise / health.customersToday)
      : 0;

  return buildRevenueDashboard({
    timezone,
    todayRevenuePaise: financial.todayRevenuePaise,
    mtdRevenuePaise: reports.monthRevenuePaise,
    outstandingDuePaise: financial.outstandingDuePaise,
    advanceLiabilityPaise: financial.advanceLiabilityPaise,
    cashCollectedPaise: mtdCollections.cash,
    upiCollectedPaise: mtdCollections.upi,
    cardCollectedPaise: mtdCollections.card,
    walletBalancePaise: financial.advanceLiabilityPaise,
    averageBillTodayPaise: avgBillToday,
    averageBillMtdPaise: avgBillMtd,
    invoicesToday: financial.todaySalesCount,
    appointmentsToday: ops.todayAppointments,
    trend30Days: financial.monthlyTrend,
    trend12Months,
    revenueByService: financial.topServicesToday,
    revenueByCategory,
    revenueByStaff,
    paymentMethodBreakdown: mtdSplit,
    outstandingTrend30: outstandingTrend30Days,
    averageBillTrend30: avgBillTrend30,
    hourlyRevenueToday: hourlyToday,
    revenueHeatmap: heatmap,
    topServices: reports.topServicesThisMonth.map((s) => ({
      id: s.serviceId,
      name: s.name,
      revenuePaise: s.revenuePaise,
    })),
    topProducts: financial.topProductsToday,
    ...health,
    averageCustomerSpendPaise: averageCustomerSpend,
    servicesRevenuePaise: servicesRevenue,
    productsRevenuePaise: productsRevenue,
    membershipRevenuePaise: membershipRevenue,
    packagesRevenuePaise: packagesRevenue,
    giftCardsRevenuePaise: mtdBreakdown.giftCardsRevenuePaise,
    refundsPaise: mtdBreakdown.refundsPaise,
    discountsPaise: mtdBreakdown.discountsPaise,
    netRevenuePaise: mtdBreakdown.netRevenuePaise,
    grossRevenuePaise: mtdBreakdown.grossRevenuePaise,
    segmentCards,
  });
}
