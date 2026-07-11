import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  lte,
  sql,
  sum,
} from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import {
  acActivityLog,
  acAssets,
  acAutomotiveDetails,
  acCapitalInvestments,
  acCategories,
  acExpenses,
  acManualProfits,
  acPaymentsReceived,
} from '@/src/capital/db/schema';
import { monthlyManualProfitSeries, sumManualProfitsPaise } from './manualProfits';

export type DashboardRange =
  | 'today'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'custom'
  | 'all';

export type DateRange = { from?: string; to?: string; label: string; key: DashboardRange };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolveDashboardRange(
  key: string | undefined,
  customFrom?: string,
  customTo?: string,
): DateRange {
  const now = new Date();
  const today = isoDate(now);

  switch (key) {
    case 'today':
      return { from: today, to: today, label: 'Today', key: 'today' };
    case 'week': {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      return { from: isoDate(start), to: today, label: 'This week', key: 'week' };
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      return { from: isoDate(start), to: today, label: 'This quarter', key: 'quarter' };
    }
    case 'year':
      return {
        from: `${now.getFullYear()}-01-01`,
        to: today,
        label: 'This year',
        key: 'year',
      };
    case 'custom':
      return {
        from: customFrom || undefined,
        to: customTo || undefined,
        label: 'Custom range',
        key: 'custom',
      };
    case 'all':
      return { label: 'All time', key: 'all' };
    case 'month':
    default: {
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      return { from: start, to: today, label: 'This month', key: 'month' };
    }
  }
}

function previousPeriod(range: DateRange): DateRange {
  if (!range.from || !range.to) return { label: 'Prior', key: 'all' };
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  const prevTo = new Date(from);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (days - 1));
  return {
    from: isoDate(prevFrom),
    to: isoDate(prevTo),
    label: 'Previous period',
    key: 'custom',
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

async function sumPaymentProfit(range?: DateRange): Promise<number> {
  const conditions = [eq(acPaymentsReceived.isReversed, false)];
  if (range?.from) conditions.push(gte(acPaymentsReceived.receivedAt, range.from));
  if (range?.to) conditions.push(lte(acPaymentsReceived.receivedAt, range.to));
  const [row] = await capitalDb
    .select({ total: sum(acPaymentsReceived.profitPaise) })
    .from(acPaymentsReceived)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

async function sumCapitalInvested(range?: DateRange): Promise<number> {
  const conditions = [eq(acCapitalInvestments.isReversed, false)];
  if (range?.from) conditions.push(gte(acCapitalInvestments.investedAt, range.from));
  if (range?.to) conditions.push(lte(acCapitalInvestments.investedAt, range.to));
  const [row] = await capitalDb
    .select({ total: sum(acCapitalInvestments.amountPaise) })
    .from(acCapitalInvestments)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

async function sumCapitalReturned(range?: DateRange): Promise<number> {
  const conditions = [eq(acPaymentsReceived.isReversed, false)];
  if (range?.from) conditions.push(gte(acPaymentsReceived.receivedAt, range.from));
  if (range?.to) conditions.push(lte(acPaymentsReceived.receivedAt, range.to));
  const [row] = await capitalDb
    .select({ total: sum(acPaymentsReceived.capitalReturnedPaise) })
    .from(acPaymentsReceived)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

export async function getOverviewBundle(range: DateRange) {
  const prev = previousPeriod(range);

  const [
    totalCapitalAll,
    _capitalReturnedAll,
    paymentProfitAll,
    manualProfitAll,
    paymentProfitRange,
    manualProfitRange,
    paymentProfitPrev,
    manualProfitPrev,
    capitalInvestedRange,
    capitalInvestedPrev,
    capitalInMarket,
    cashComponents,
    activeVehicles,
    soldVehicles,
    avgProfitSold,
    avgHolding,
    best,
    worst,
    statusBreakdown,
    expenseBreakdown,
    monthlyProfitPayments,
    monthlyManual,
    monthlyInvestments,
    monthlyRoi,
    profitByManufacturer,
    profitByVehicle,
    profitByMonth,
    profitBySource,
    activity,
    pendingSales,
    outstandingReceivables,
  ] = await Promise.all([
    sumCapitalInvested(),
    sumCapitalReturned(),
    sumPaymentProfit(),
    sumManualProfitsPaise(),
    sumPaymentProfit(range),
    sumManualProfitsPaise({ from: range.from, to: range.to }),
    sumPaymentProfit(prev),
    sumManualProfitsPaise({ from: prev.from, to: prev.to }),
    sumCapitalInvested(range),
    sumCapitalInvested(prev),
    capitalDb
      .select({ total: sum(acAssets.outstandingPaise) })
      .from(acAssets)
      .where(sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`)
      .then((r) => Number(r[0]?.total ?? 0)),
    capitalDb
      .select({
        capital: sum(acPaymentsReceived.capitalReturnedPaise),
        profit: sum(acPaymentsReceived.profitPaise),
      })
      .from(acPaymentsReceived)
      .where(eq(acPaymentsReceived.isReversed, false))
      .then(async (r) => ({
        capital: Number(r[0]?.capital ?? 0),
        profit: Number(r[0]?.profit ?? 0),
        manual: await sumManualProfitsPaise(),
      })),
    capitalDb
      .select({ c: count() })
      .from(acAssets)
      .where(sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`)
      .then((r) => Number(r[0]?.c ?? 0)),
    capitalDb
      .select({ c: count() })
      .from(acAssets)
      .where(sql`${acAssets.status} IN ('sold', 'settled')`)
      .then((r) => Number(r[0]?.c ?? 0)),
    capitalDb
      .select({ avg: sql<number>`COALESCE(AVG(${acAssets.profitPaise}), 0)` })
      .from(acAssets)
      .where(sql`${acAssets.profitPaise} IS NOT NULL`)
      .then((r) => Math.round(Number(r[0]?.avg ?? 0))),
    capitalDb
      .select({ avg: sql<number>`COALESCE(AVG(${acAssets.holdingDays}), 0)` })
      .from(acAssets)
      .where(sql`${acAssets.holdingDays} IS NOT NULL`)
      .then((r) => Math.round(Number(r[0]?.avg ?? 0))),
    capitalDb
      .select({
        id: acAssets.id,
        name: acAssets.displayName,
        profitPaise: acAssets.profitPaise,
        roiBps: acAssets.roiBps,
        reg: acAutomotiveDetails.registrationNumber,
      })
      .from(acAssets)
      .leftJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
      .where(sql`${acAssets.profitPaise} IS NOT NULL`)
      .orderBy(desc(acAssets.profitPaise))
      .limit(1)
      .then((r) => r[0] ?? null),
    capitalDb
      .select({
        id: acAssets.id,
        name: acAssets.displayName,
        profitPaise: acAssets.profitPaise,
        roiBps: acAssets.roiBps,
        reg: acAutomotiveDetails.registrationNumber,
      })
      .from(acAssets)
      .leftJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
      .where(sql`${acAssets.profitPaise} IS NOT NULL`)
      .orderBy(asc(acAssets.profitPaise))
      .limit(1)
      .then((r) => r[0] ?? null),
    capitalDb
      .select({ status: acAssets.status, c: count() })
      .from(acAssets)
      .groupBy(acAssets.status)
      .then((rows) =>
        rows.map((r) => ({ label: String(r.status), value: Number(r.c) })),
      ),
    capitalDb
      .select({
        label: acCategories.label,
        total: sum(acExpenses.amountPaise),
      })
      .from(acExpenses)
      .innerJoin(acCategories, eq(acExpenses.categoryId, acCategories.id))
      .where(eq(acExpenses.isReversed, false))
      .groupBy(acCategories.label)
      .orderBy(desc(sum(acExpenses.amountPaise)))
      .then((rows) =>
        rows.map((r) => ({ label: r.label, valuePaise: Number(r.total ?? 0) })),
      ),
    capitalDb
      .select({
        month: sql<string>`to_char(${acPaymentsReceived.receivedAt}::date, 'YYYY-MM')`,
        profit: sum(acPaymentsReceived.profitPaise),
      })
      .from(acPaymentsReceived)
      .where(eq(acPaymentsReceived.isReversed, false))
      .groupBy(sql`to_char(${acPaymentsReceived.receivedAt}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${acPaymentsReceived.receivedAt}::date, 'YYYY-MM')`)
      .then((rows) =>
        rows.map((r) => ({ month: r.month, valuePaise: Number(r.profit ?? 0) })),
      ),
    monthlyManualProfitSeries(),
    capitalDb
      .select({
        month: sql<string>`to_char(${acCapitalInvestments.investedAt}::date, 'YYYY-MM')`,
        total: sum(acCapitalInvestments.amountPaise),
      })
      .from(acCapitalInvestments)
      .where(eq(acCapitalInvestments.isReversed, false))
      .groupBy(sql`to_char(${acCapitalInvestments.investedAt}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${acCapitalInvestments.investedAt}::date, 'YYYY-MM')`)
      .then((rows) =>
        rows.map((r) => ({ month: r.month, valuePaise: Number(r.total ?? 0) })),
      ),
    capitalDb
      .select({
        month: sql<string>`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`,
        avgRoi: sql<number>`COALESCE(AVG(${acAssets.roiBps}), 0)`,
      })
      .from(acAssets)
      .where(sql`${acAssets.saleDate} IS NOT NULL AND ${acAssets.roiBps} IS NOT NULL`)
      .groupBy(sql`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`)
      .then((rows) =>
        rows.map((r) => ({ month: r.month, roiBps: Math.round(Number(r.avgRoi)) })),
      ),
    capitalDb
      .select({
        label: acAutomotiveDetails.manufacturer,
        total: sum(acAssets.profitPaise),
      })
      .from(acAssets)
      .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
      .where(sql`${acAssets.profitPaise} IS NOT NULL`)
      .groupBy(acAutomotiveDetails.manufacturer)
      .orderBy(desc(sum(acAssets.profitPaise)))
      .limit(8)
      .then((rows) =>
        rows.map((r) => ({ label: r.label, valuePaise: Number(r.total ?? 0) })),
      ),
    capitalDb
      .select({
        label: sql<string>`COALESCE(${acAutomotiveDetails.registrationNumber}, ${acAssets.displayName})`,
        total: acAssets.profitPaise,
      })
      .from(acAssets)
      .leftJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
      .where(sql`${acAssets.profitPaise} IS NOT NULL`)
      .orderBy(desc(acAssets.profitPaise))
      .limit(8)
      .then((rows) =>
        rows.map((r) => ({ label: r.label, valuePaise: Number(r.total ?? 0) })),
      ),
    capitalDb
      .select({
        month: sql<string>`to_char(COALESCE(${acAssets.saleDate}, ${acAssets.purchaseDate})::date, 'YYYY-MM')`,
        total: sum(acAssets.profitPaise),
      })
      .from(acAssets)
      .where(sql`${acAssets.profitPaise} IS NOT NULL`)
      .groupBy(sql`to_char(COALESCE(${acAssets.saleDate}, ${acAssets.purchaseDate})::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(COALESCE(${acAssets.saleDate}, ${acAssets.purchaseDate})::date, 'YYYY-MM')`)
      .then((rows) =>
        rows.map((r) => ({ label: r.month, valuePaise: Number(r.total ?? 0) })),
      ),
    capitalDb
      .select({
        label: acManualProfits.source,
        total: sum(acManualProfits.amountPaise),
      })
      .from(acManualProfits)
      .where(eq(acManualProfits.isReversed, false))
      .groupBy(acManualProfits.source)
      .orderBy(desc(sum(acManualProfits.amountPaise)))
      .limit(8)
      .then((rows) =>
        rows.map((r) => ({ label: r.label, valuePaise: Number(r.total ?? 0) })),
      ),
    capitalDb
      .select()
      .from(acActivityLog)
      .orderBy(desc(acActivityLog.createdAt))
      .limit(20),
    capitalDb
      .select({ total: sum(acAssets.expectedSalePricePaise) })
      .from(acAssets)
      .where(eq(acAssets.status, 'listed'))
      .then((r) => Number(r[0]?.total ?? 0)),
    capitalDb
      .select({ total: sum(acAssets.outstandingPaise) })
      .from(acAssets)
      .where(sql`${acAssets.status} IN ('sold')`)
      .then((r) => Number(r[0]?.total ?? 0)),
  ]);

  const totalProfitAll = paymentProfitAll + manualProfitAll;
  const totalProfitRange = paymentProfitRange + manualProfitRange;
  const totalProfitPrev = paymentProfitPrev + manualProfitPrev;
  const cashAvailable = cashComponents.capital + cashComponents.profit + cashComponents.manual;
  const totalRoiBps =
    totalCapitalAll > 0 ? Math.round((totalProfitAll / totalCapitalAll) * 10000) : 0;
  const utilizationBps =
    totalCapitalAll > 0 ? Math.round((capitalInMarket / totalCapitalAll) * 10000) : 0;

  const monthMap = new Map<string, number>();
  for (const p of monthlyProfitPayments) {
    monthMap.set(p.month, (monthMap.get(p.month) ?? 0) + p.valuePaise);
  }
  for (const m of monthlyManual) {
    monthMap.set(m.month, (monthMap.get(m.month) ?? 0) + m.valuePaise);
  }
  const monthlyProfit = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, valuePaise]) => ({ month, valuePaise }));

  // Portfolio OHLC from cumulative capital + profit trajectory by month
  let runningCapital = 0;
  let runningProfit = 0;
  const investByMonth = new Map(monthlyInvestments.map((m) => [m.month, m.valuePaise]));
  const profitByMonthMap = new Map(monthlyProfit.map((m) => [m.month, m.valuePaise]));
  const allMonths = [
    ...new Set([...investByMonth.keys(), ...profitByMonthMap.keys()]),
  ].sort();
  const portfolioOhlc = allMonths.map((month) => {
    const open = runningCapital + runningProfit;
    runningCapital += investByMonth.get(month) ?? 0;
    runningProfit += profitByMonthMap.get(month) ?? 0;
    const closeValue = runningCapital + runningProfit;
    return {
      month,
      openPaise: open,
      highPaise: Math.max(open, closeValue),
      lowPaise: Math.min(open, closeValue),
      closePaise: closeValue,
    };
  });

  const totalExpenses = expenseBreakdown.reduce((s, e) => s + e.valuePaise, 0);
  const repairExpense = expenseBreakdown
    .filter((e) => /repair|dent|paint|engine/i.test(e.label))
    .reduce((s, e) => s + e.valuePaise, 0);

  const insights: string[] = [];
  const profitDelta = pctChange(totalProfitRange, totalProfitPrev);
  if (profitDelta != null) {
    insights.push(
      profitDelta >= 0
        ? `This period profit ${profitDelta === 0 ? 'is flat' : `increased by ${profitDelta}%`} vs prior period.`
        : `This period profit decreased by ${Math.abs(profitDelta)}% vs prior period.`,
    );
  }
  if (totalExpenses > 0) {
    const repairPct = Math.round((repairExpense / totalExpenses) * 1000) / 10;
    insights.push(`Repairs-related costs are ${repairPct}% of total expenses.`);
  }
  if (profitByManufacturer[0]) {
    insights.push(
      `${profitByManufacturer[0].label} vehicles produce the highest total profit (${formatInsightMoney(profitByManufacturer[0].valuePaise)}).`,
    );
  }
  if (avgHolding > 0) {
    insights.push(`Average holding period is ${avgHolding} days.`);
  }
  insights.push(`Capital utilization is ${(utilizationBps / 100).toFixed(1)}%.`);

  const kpis = [
    kpi('Total Capital Invested', totalCapitalAll, 'wallet', capitalInvestedRange, capitalInvestedPrev, 'paise'),
    kpi('Current Capital in Market', capitalInMarket, 'banknote', null, null, 'paise'),
    kpi('Cash Available', cashAvailable, 'wallet', null, null, 'paise'),
    kpi('Total Profit Earned', totalProfitAll, 'trendingUp', totalProfitRange, totalProfitPrev, 'paise'),
    kpi('Total ROI', totalRoiBps, 'trendingUp', null, null, 'bps'),
    kpi('Active Vehicles', activeVehicles, 'car', null, null, 'count'),
    kpi('Vehicles Sold', soldVehicles, 'car', null, null, 'count'),
    kpi('Avg Profit / Vehicle', avgProfitSold, 'trendingUp', null, null, 'paise'),
    kpi('Avg Holding Days', avgHolding, 'clock', null, null, 'days'),
    {
      title: 'Best Performing',
      icon: 'trendingUp' as const,
      valueText: best
        ? `${best.reg ?? best.name} · ${formatInsightMoney(best.profitPaise ?? 0)}`
        : '—',
      trend: 'up' as const,
      changePct: null,
      href: best ? `/assets/${best.id}` : undefined,
    },
    {
      title: 'Worst Performing',
      icon: 'trendingUp' as const,
      valueText: worst
        ? `${worst.reg ?? worst.name} · ${formatInsightMoney(worst.profitPaise ?? 0)}`
        : '—',
      trend: 'down' as const,
      changePct: null,
      href: worst ? `/assets/${worst.id}` : undefined,
    },
  ];

  return {
    range,
    kpis,
    charts: {
      monthlyProfit,
      monthlyInvestment: monthlyInvestments,
      roiGrowth: monthlyRoi,
      capitalAllocation: [
        { label: 'Cash', valuePaise: cashAvailable },
        { label: 'Active Investments', valuePaise: capitalInMarket },
        { label: 'Pending Sales', valuePaise: pendingSales },
        { label: 'Outstanding Receivables', valuePaise: outstandingReceivables },
      ],
      expenseBreakdown,
      profitByManufacturer,
      profitByVehicle,
      profitByMonth,
      profitBySource,
      vehicleStatus: statusBreakdown,
      portfolioOhlc,
    },
    insights,
    activity: activity.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      createdAt: a.createdAt?.toISOString?.() ?? String(a.createdAt),
      afterState: a.afterState,
    })),
    totals: {
      totalProfitAll,
      totalProfitRange,
      manualProfitAll,
      paymentProfitAll,
      cashAvailable,
      capitalInMarket,
      totalCapitalAll,
      totalRoiBps,
      utilizationBps,
    },
  };
}

function formatInsightMoney(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function kpi(
  title: string,
  value: number,
  icon: 'wallet' | 'banknote' | 'trendingUp' | 'car' | 'clock',
  rangeValue: number | null,
  prevValue: number | null,
  kind: 'paise' | 'bps' | 'count' | 'days',
) {
  const changePct =
    rangeValue != null && prevValue != null ? pctChange(rangeValue, prevValue) : null;
  const trend =
    changePct == null ? ('neutral' as const) : changePct > 0 ? ('up' as const) : changePct < 0 ? ('down' as const) : ('neutral' as const);
  return {
    title,
    icon,
    kind,
    valuePaise: kind === 'paise' ? value : undefined,
    valueText:
      kind === 'bps'
        ? `${(value / 100).toFixed(1)}%`
        : kind === 'count'
          ? String(value)
          : kind === 'days'
            ? `${value} days`
            : undefined,
    trend,
    changePct,
  };
}

export type OverviewBundle = Awaited<ReturnType<typeof getOverviewBundle>>;
