import {
  and,
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
  acCapitalInvestments,
  acCategories,
  acExpenses,
  acPaymentsReceived,
} from '@/src/capital/db/schema';
import { calcRoiBps } from '@/src/capital/lib/money';
import {
  isFutureRange,
  isoDate,
  pctChange,
  previousPeriod,
  shiftMonth,
  type DateRange,
  type DashboardRange,
} from '@/src/capital/lib/dashboardRange';
import { monthlyManualProfitSeries, sumManualProfitsPaise } from './manualProfits';

export type { DateRange, DashboardRange };
export {
  resolveDashboardRange,
  shiftMonth,
  currentMonthKey,
} from '@/src/capital/lib/dashboardRange';

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

async function sumPurchaseVolume(range?: DateRange): Promise<number> {
  const conditions = [sql`${acAssets.status} <> 'cancelled'`];
  if (range?.from) conditions.push(gte(acAssets.purchaseDate, range.from));
  if (range?.to) conditions.push(lte(acAssets.purchaseDate, range.to));
  const [row] = await capitalDb
    .select({ total: sum(acAssets.purchasePricePaise) })
    .from(acAssets)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

async function sumExpenses(range?: DateRange, repairOnly = false): Promise<number> {
  const conditions = [eq(acExpenses.isReversed, false)];
  if (range?.from) conditions.push(gte(acExpenses.expenseDate, range.from));
  if (range?.to) conditions.push(lte(acExpenses.expenseDate, range.to));
  if (repairOnly) {
    const [row] = await capitalDb
      .select({ total: sum(acExpenses.amountPaise) })
      .from(acExpenses)
      .innerJoin(acCategories, eq(acExpenses.categoryId, acCategories.id))
      .where(
        and(
          ...conditions,
          sql`(${acCategories.label} ILIKE '%repair%' OR ${acCategories.label} ILIKE '%paint%' OR ${acCategories.label} ILIKE '%dent%')`,
        ),
      );
    return Number(row?.total ?? 0);
  }
  const [row] = await capitalDb
    .select({ total: sum(acExpenses.amountPaise) })
    .from(acExpenses)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

async function countPurchases(range?: DateRange): Promise<number> {
  const conditions = [sql`${acAssets.status} <> 'cancelled'`];
  if (range?.from) conditions.push(gte(acAssets.purchaseDate, range.from));
  if (range?.to) conditions.push(lte(acAssets.purchaseDate, range.to));
  const [row] = await capitalDb
    .select({ c: count() })
    .from(acAssets)
    .where(and(...conditions));
  return Number(row?.c ?? 0);
}

async function countSold(range?: DateRange): Promise<number> {
  const conditions = [sql`${acAssets.status} IN ('sold', 'settled')`];
  if (range?.from) conditions.push(sql`COALESCE(${acAssets.saleDate}, ${acAssets.purchaseDate}) >= ${range.from}`);
  if (range?.to) conditions.push(sql`COALESCE(${acAssets.saleDate}, ${acAssets.purchaseDate}) <= ${range.to}`);
  const [row] = await capitalDb
    .select({ c: count() })
    .from(acAssets)
    .where(and(...conditions));
  return Number(row?.c ?? 0);
}

async function sumSaleProceeds(range?: DateRange): Promise<number> {
  const conditions = [
    sql`${acAssets.actualSalePricePaise} IS NOT NULL`,
    sql`${acAssets.status} <> 'cancelled'`,
  ];
  if (range?.from) conditions.push(gte(acAssets.saleDate, range.from));
  if (range?.to) conditions.push(lte(acAssets.saleDate, range.to));
  const [row] = await capitalDb
    .select({ total: sum(acAssets.actualSalePricePaise) })
    .from(acAssets)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

export async function getOverviewBundle(range: DateRange) {
  const prev = previousPeriod(range);
  const future = isFutureRange(range);
  const today = isoDate(new Date());

  const [
    capitalInjectedAll,
    lifetimePurchaseVolume,
    paymentProfitAll,
    manualProfitAll,
    paymentProfitRange,
    manualProfitRange,
    paymentProfitPrev,
    manualProfitPrev,
    purchaseVolumeRange,
    currentInvestment,
    activeVehicles,
    soldVehiclesLifetime,
    soldVehiclesRange,
    purchasesRange,
    avgProfitSold,
    avgHolding,
    capitalReturnedRange,
    repairsRange,
    expensesRange,
    saleProceedsRange,
    monthlyProfitPayments,
    monthlyManual,
    monthlyPurchases,
    activity,
    activeInvestmentRows,
  ] = await Promise.all([
    sumCapitalInvested(),
    sumPurchaseVolume(),
    sumPaymentProfit(),
    sumManualProfitsPaise(),
    future ? Promise.resolve(0) : sumPaymentProfit(range),
    future ? Promise.resolve(0) : sumManualProfitsPaise({ from: range.from, to: range.to }),
    sumPaymentProfit(prev),
    sumManualProfitsPaise({ from: prev.from, to: prev.to }),
    future ? Promise.resolve(0) : sumPurchaseVolume(range),
    capitalDb
      .select({ total: sum(acAssets.totalInvestmentPaise) })
      .from(acAssets)
      .where(sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`)
      .then((r) => Number(r[0]?.total ?? 0)),
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
    future ? Promise.resolve(0) : countSold(range),
    future ? Promise.resolve(0) : countPurchases(range),
    capitalDb
      .select({ avg: sql<number>`COALESCE(AVG(${acAssets.profitPaise}), 0)` })
      .from(acAssets)
      .where(sql`${acAssets.profitPaise} IS NOT NULL AND ${acAssets.status} <> 'cancelled'`)
      .then((r) => Math.round(Number(r[0]?.avg ?? 0))),
    capitalDb
      .select({ avg: sql<number>`COALESCE(AVG(${acAssets.holdingDays}), 0)` })
      .from(acAssets)
      .where(sql`${acAssets.holdingDays} IS NOT NULL AND ${acAssets.status} <> 'cancelled'`)
      .then((r) => Math.round(Number(r[0]?.avg ?? 0))),
    future ? Promise.resolve(0) : sumCapitalReturned(range),
    future ? Promise.resolve(0) : sumExpenses(range, true),
    future ? Promise.resolve(0) : sumExpenses(range, false),
    future ? Promise.resolve(0) : sumSaleProceeds(range),
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
        month: sql<string>`to_char(${acAssets.purchaseDate}::date, 'YYYY-MM')`,
        total: sum(acAssets.purchasePricePaise),
      })
      .from(acAssets)
      .where(sql`${acAssets.status} <> 'cancelled'`)
      .groupBy(sql`to_char(${acAssets.purchaseDate}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${acAssets.purchaseDate}::date, 'YYYY-MM')`)
      .then((rows) =>
        rows.map((r) => ({ month: r.month, valuePaise: Number(r.total ?? 0) })),
      ),
    capitalDb
      .select()
      .from(acActivityLog)
      .orderBy(desc(acActivityLog.createdAt))
      .limit(24),
    capitalDb
      .select({
        status: acAssets.status,
        total: sum(acAssets.totalInvestmentPaise),
        c: count(),
      })
      .from(acAssets)
      .where(sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`)
      .groupBy(acAssets.status),
  ]);

  const lifetimeProfit = paymentProfitAll + manualProfitAll;
  const periodProfit = paymentProfitRange + manualProfitRange;
  const prevProfit = paymentProfitPrev + manualProfitPrev;
  const overallRoiBps = calcRoiBps(lifetimeProfit, lifetimePurchaseVolume) ?? 0;

  // Liquid cash ≈ capital injected − money locked in active vehicles + lifetime profit
  const cashAvailable = Math.max(0, capitalInjectedAll - currentInvestment + lifetimeProfit);

  const monthMap = new Map<string, number>();
  for (const p of monthlyProfitPayments) {
    monthMap.set(p.month, (monthMap.get(p.month) ?? 0) + p.valuePaise);
  }
  for (const m of monthlyManual) {
    monthMap.set(m.month, (monthMap.get(m.month) ?? 0) + m.valuePaise);
  }
  let monthlyProfitSeries = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, valuePaise]) => ({ month, valuePaise }));

  // Clip series to selected range end when a bounded range is active
  if (range.to) {
    const endYm = range.to.slice(0, 7);
    monthlyProfitSeries = monthlyProfitSeries.filter((m) => m.month <= endYm);
  }
  if (range.from && range.key !== 'all' && range.key !== 'month') {
    const startYm = range.from.slice(0, 7);
    monthlyProfitSeries = monthlyProfitSeries.filter((m) => m.month >= startYm);
  }
  // For month cursor, show trailing 12 months ending at selected month
  if (range.key === 'month' && range.month) {
    const end = range.month;
    const start = shiftMonth(end, -11);
    monthlyProfitSeries = [...Array(12)].map((_, i) => {
      const month = shiftMonth(start, i);
      return {
        month,
        valuePaise: monthMap.get(month) ?? 0,
      };
    }).filter((m) => m.month <= end);
  }

  // Portfolio growth = cumulative lifetime profit by month (through range end)
  let runningProfit = 0;
  const allProfitMonths = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  const portfolioGrowth: { month: string; valuePaise: number }[] = [];
  for (const [month, value] of allProfitMonths) {
    if (range.to && month > range.to.slice(0, 7)) break;
    runningProfit += value;
    portfolioGrowth.push({ month, valuePaise: runningProfit });
  }

  const periodRoiBps =
    purchaseVolumeRange > 0
      ? (calcRoiBps(periodProfit, purchaseVolumeRange) ?? 0)
      : 0;

  const profitGrowthPct = pctChange(periodProfit, prevProfit);

  // Avg profit across months with data in the displayed series
  const monthsWithProfit = monthlyProfitSeries.filter((m) => m.valuePaise !== 0);
  const avgMonthlyProfit =
    monthsWithProfit.length > 0
      ? Math.round(
          monthsWithProfit.reduce((s, m) => s + m.valuePaise, 0) / monthsWithProfit.length,
        )
      : 0;

  const allocation = [
    { label: 'Active Vehicles', valuePaise: currentInvestment },
    { label: 'Cash Available', valuePaise: cashAvailable },
  ].filter((a) => a.valuePaise > 0);

  // Add status breakdown of active capital for donut detail
  for (const row of activeInvestmentRows) {
    const v = Number(row.total ?? 0);
    if (v > 0 && row.status !== 'purchased') {
      allocation.push({
        label: String(row.status).replace(/_/g, ' '),
        valuePaise: v,
      });
    }
  }

  const waterfall = [
    { label: 'Purchases', valuePaise: purchaseVolumeRange, kind: 'out' as const },
    { label: 'Repairs', valuePaise: repairsRange || expensesRange, kind: 'out' as const },
    { label: 'Sale Proceeds', valuePaise: saleProceedsRange, kind: 'in' as const },
    { label: 'Profit', valuePaise: periodProfit, kind: 'result' as const },
  ];

  // Timeline from activity filtered to range
  const timeline = activity
    .filter((a) => {
      if (future) return false;
      if (!range.from && !range.to) return true;
      const day = (a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt))
        .toISOString()
        .slice(0, 10);
      if (range.from && day < range.from) return false;
      if (range.to && day > range.to) return false;
      return true;
    })
    .slice(0, 12)
    .map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      createdAt: a.createdAt?.toISOString?.() ?? String(a.createdAt),
      afterState: a.afterState,
    }));

  const periodHasData =
    !future &&
    (purchasesRange > 0 ||
      soldVehiclesRange > 0 ||
      periodProfit !== 0 ||
      purchaseVolumeRange > 0 ||
      capitalReturnedRange > 0 ||
      expensesRange > 0 ||
      saleProceedsRange > 0);

  const moneyReturnedRange = capitalReturnedRange + periodProfit;

  return {
    range,
    isFuture: future,
    today,
    hero: {
      currentInvestmentPaise: currentInvestment,
      lifetimePurchaseVolumePaise: lifetimePurchaseVolume,
      lifetimeProfitPaise: lifetimeProfit,
      overallRoiBps,
    },
    secondary: {
      cashAvailablePaise: cashAvailable,
      activeVehicles,
      vehiclesSold: soldVehiclesLifetime,
      avgProfitPerVehiclePaise: avgProfitSold,
    },
    portfolioSummary: {
      lifetimePurchaseVolumePaise: lifetimePurchaseVolume,
      lifetimeProfitPaise: lifetimeProfit,
      overallRoiBps,
      vehiclesSold: soldVehiclesLifetime,
      avgProfitPerVehiclePaise: avgProfitSold,
      avgHoldingDays: avgHolding,
    },
    period: {
      label: range.label,
      hasData: periodHasData,
      vehiclesPurchased: purchasesRange,
      vehiclesSold: soldVehiclesRange,
      moneyInvestedPaise: purchaseVolumeRange,
      moneyReturnedPaise: moneyReturnedRange,
      profitPaise: periodProfit,
      repairsPaise: repairsRange || expensesRange,
      cashAvailablePaise: cashAvailable,
      currentInvestmentPaise: currentInvestment,
    },
    chartBlocks: {
      portfolioGrowth: {
        series: portfolioGrowth,
        kpis: [
          {
            label: 'Portfolio Value',
            valuePaise: portfolioGrowth.at(-1)?.valuePaise ?? lifetimeProfit,
            kind: 'paise' as const,
          },
          {
            label: 'Lifetime Profit',
            valuePaise: lifetimeProfit,
            kind: 'paise' as const,
          },
          {
            label: 'Overall ROI',
            valueText: `${(overallRoiBps / 100).toFixed(1)}%`,
            kind: 'text' as const,
          },
          {
            label: 'Purchase Volume',
            valuePaise: lifetimePurchaseVolume,
            kind: 'paise' as const,
          },
        ],
      },
      monthlyProfit: {
        series: future ? [] : monthlyProfitSeries,
        kpis: [
          {
            label: range.key === 'month' ? 'Monthly Profit' : 'Period Profit',
            valuePaise: periodProfit,
            kind: 'paise' as const,
          },
          {
            label: 'Average Profit',
            valuePaise: avgMonthlyProfit,
            kind: 'paise' as const,
          },
          {
            label: 'Profit Growth',
            valueText:
              profitGrowthPct == null
                ? '—'
                : `${profitGrowthPct > 0 ? '+' : ''}${profitGrowthPct}%`,
            kind: 'text' as const,
            trend:
              profitGrowthPct == null
                ? ('neutral' as const)
                : profitGrowthPct > 0
                  ? ('up' as const)
                  : profitGrowthPct < 0
                    ? ('down' as const)
                    : ('neutral' as const),
          },
          {
            label: 'Period ROI',
            valueText: `${(periodRoiBps / 100).toFixed(1)}%`,
            kind: 'text' as const,
          },
        ],
      },
      capitalAllocation: {
        series: allocation,
        kpis: [
          {
            label: 'Current Investment',
            valuePaise: currentInvestment,
            kind: 'paise' as const,
          },
          {
            label: 'Cash Available',
            valuePaise: cashAvailable,
            kind: 'paise' as const,
          },
          {
            label: 'Active Vehicles',
            valueText: String(activeVehicles),
            kind: 'text' as const,
          },
          {
            label: 'Deployed',
            valueText:
              currentInvestment + cashAvailable > 0
                ? `${((currentInvestment / (currentInvestment + cashAvailable)) * 100).toFixed(0)}%`
                : '—',
            kind: 'text' as const,
          },
        ],
      },
      waterfall: {
        series: future ? [] : waterfall,
        kpis: [
          {
            label: 'Money Invested',
            valuePaise: purchaseVolumeRange,
            kind: 'paise' as const,
          },
          {
            label: 'Repairs',
            valuePaise: repairsRange || expensesRange,
            kind: 'paise' as const,
          },
          {
            label: 'Sale Proceeds',
            valuePaise: saleProceedsRange,
            kind: 'paise' as const,
          },
          {
            label: 'Profit',
            valuePaise: periodProfit,
            kind: 'paise' as const,
          },
        ],
      },
    },
    timeline,
    activity: activity.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      createdAt: a.createdAt?.toISOString?.() ?? String(a.createdAt),
      afterState: a.afterState,
    })),
    monthlyPurchases,
  };
}

export type OverviewBundle = Awaited<ReturnType<typeof getOverviewBundle>>;
