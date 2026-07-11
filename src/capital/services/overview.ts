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
import { monthlyManualProfitSeries, sumManualMySharePaise, sumManualProfitsPaise } from './manualProfits';

export type { DateRange, DashboardRange };
export {
  resolveDashboardRange,
  shiftMonth,
  currentMonthKey,
} from '@/src/capital/lib/dashboardRange';

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
    grossAssetProfitAll,
    myAssetShareAll,
    grossAssetProfitRange,
    myAssetShareRange,
    myAssetSharePrev,
    manualGrossAll,
    manualMyAll,
    manualGrossRange,
    manualMyRange,
    manualMyPrev,
    purchaseVolumeRange,
    currentInvestment,
    activeVehicles,
    soldVehiclesLifetime,
    soldVehiclesRange,
    purchasesRange,
    avgMyProfitSold,
    avgHolding,
    capitalReturnedRange,
    repairsRange,
    expensesRange,
    saleProceedsRange,
    monthlyGrossAsset,
    monthlyMyAsset,
    monthlyManualGross,
    monthlyManualMine,
    monthlyPurchases,
    activity,
    activeInvestmentRows,
  ] = await Promise.all([
    sumCapitalInvested(),
    sumPurchaseVolume(),
    capitalDb
      .select({ total: sum(acAssets.profitPaise) })
      .from(acAssets)
      .where(sql`${acAssets.profitPaise} IS NOT NULL AND ${acAssets.status} <> 'cancelled'`)
      .then((r) => Number(r[0]?.total ?? 0)),
    capitalDb
      .select({ total: sum(acAssets.mySharePaise) })
      .from(acAssets)
      .where(sql`${acAssets.mySharePaise} IS NOT NULL AND ${acAssets.status} <> 'cancelled'`)
      .then((r) => Number(r[0]?.total ?? 0)),
    future
      ? Promise.resolve(0)
      : capitalDb
          .select({ total: sum(acAssets.profitPaise) })
          .from(acAssets)
          .where(
            and(
              sql`${acAssets.profitPaise} IS NOT NULL AND ${acAssets.status} <> 'cancelled'`,
              range.from ? gte(acAssets.saleDate, range.from) : sql`true`,
              range.to ? lte(acAssets.saleDate, range.to) : sql`true`,
            ),
          )
          .then((r) => Number(r[0]?.total ?? 0)),
    future
      ? Promise.resolve(0)
      : capitalDb
          .select({ total: sum(acAssets.mySharePaise) })
          .from(acAssets)
          .where(
            and(
              sql`${acAssets.mySharePaise} IS NOT NULL AND ${acAssets.status} <> 'cancelled'`,
              range.from ? gte(acAssets.saleDate, range.from) : sql`true`,
              range.to ? lte(acAssets.saleDate, range.to) : sql`true`,
            ),
          )
          .then((r) => Number(r[0]?.total ?? 0)),
    capitalDb
      .select({ total: sum(acAssets.mySharePaise) })
      .from(acAssets)
      .where(
        and(
          sql`${acAssets.mySharePaise} IS NOT NULL AND ${acAssets.status} <> 'cancelled'`,
          prev.from ? gte(acAssets.saleDate, prev.from) : sql`true`,
          prev.to ? lte(acAssets.saleDate, prev.to) : sql`true`,
        ),
      )
      .then((r) => Number(r[0]?.total ?? 0)),
    sumManualProfitsPaise(),
    sumManualMySharePaise(),
    future ? Promise.resolve(0) : sumManualProfitsPaise({ from: range.from, to: range.to }),
    future ? Promise.resolve(0) : sumManualMySharePaise({ from: range.from, to: range.to }),
    sumManualMySharePaise({ from: prev.from, to: prev.to }),
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
      .select({ avg: sql<number>`COALESCE(AVG(${acAssets.mySharePaise}), 0)` })
      .from(acAssets)
      .where(sql`${acAssets.mySharePaise} IS NOT NULL AND ${acAssets.status} <> 'cancelled'`)
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
        month: sql<string>`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`,
        profit: sum(acAssets.profitPaise),
      })
      .from(acAssets)
      .where(sql`${acAssets.saleDate} IS NOT NULL AND ${acAssets.profitPaise} IS NOT NULL`)
      .groupBy(sql`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`)
      .then((rows) =>
        rows.map((r) => ({ month: r.month, valuePaise: Number(r.profit ?? 0) })),
      ),
    capitalDb
      .select({
        month: sql<string>`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`,
        profit: sum(acAssets.mySharePaise),
      })
      .from(acAssets)
      .where(sql`${acAssets.saleDate} IS NOT NULL AND ${acAssets.mySharePaise} IS NOT NULL`)
      .groupBy(sql`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`)
      .then((rows) =>
        rows.map((r) => ({ month: r.month, valuePaise: Number(r.profit ?? 0) })),
      ),
    monthlyManualProfitSeries(),
    monthlyManualProfitSeries({ mine: true }),
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

  const grossBusinessProfit = grossAssetProfitAll + manualGrossAll;
  const myLifetimeProfit = myAssetShareAll + manualMyAll;
  const periodGross = grossAssetProfitRange + manualGrossRange;
  const periodMy = myAssetShareRange + manualMyRange;
  const prevMy = myAssetSharePrev + manualMyPrev;

  const businessRoiBps = calcRoiBps(grossBusinessProfit, lifetimePurchaseVolume) ?? 0;
  const myRoiBps = calcRoiBps(myLifetimeProfit, capitalInjectedAll) ?? 0;

  // Liquid cash ≈ capital injected − locked in vehicles + my profit share
  const cashAvailable = Math.max(0, capitalInjectedAll - currentInvestment + myLifetimeProfit);

  function mergeMonthSeries(
    a: { month: string; valuePaise: number }[],
    b: { month: string; valuePaise: number }[],
  ) {
    const map = new Map<string, number>();
    for (const p of a) map.set(p.month, (map.get(p.month) ?? 0) + p.valuePaise);
    for (const p of b) map.set(p.month, (map.get(p.month) ?? 0) + p.valuePaise);
    return [...map.entries()]
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([month, valuePaise]) => ({ month, valuePaise }));
  }

  let monthlyGrossSeries = mergeMonthSeries(monthlyGrossAsset, monthlyManualGross);
  let monthlyMySeries = mergeMonthSeries(monthlyMyAsset, monthlyManualMine);

  const clipSeries = (series: { month: string; valuePaise: number }[]) => {
    let next = series;
    if (range.to) next = next.filter((m) => m.month <= range.to!.slice(0, 7));
    if (range.from && range.key !== 'all' && range.key !== 'month') {
      next = next.filter((m) => m.month >= range.from!.slice(0, 7));
    }
    if (range.key === 'month' && range.month) {
      const end = range.month;
      const start = shiftMonth(end, -11);
      const map = new Map(series.map((m) => [m.month, m.valuePaise]));
      next = [...Array(12)]
        .map((_, i) => {
          const month = shiftMonth(start, i);
          return { month, valuePaise: map.get(month) ?? 0 };
        })
        .filter((m) => m.month <= end);
    }
    return next;
  };

  monthlyGrossSeries = clipSeries(monthlyGrossSeries);
  monthlyMySeries = clipSeries(monthlyMySeries);

  // Portfolio growth = cumulative MY profit (personal returns)
  let runningMy = 0;
  const allMyMonths = mergeMonthSeries(monthlyMyAsset, monthlyManualMine);
  const portfolioGrowth: { month: string; valuePaise: number }[] = [];
  for (const row of allMyMonths) {
    if (range.to && row.month > range.to.slice(0, 7)) break;
    runningMy += row.valuePaise;
    portfolioGrowth.push({ month: row.month, valuePaise: runningMy });
  }

  let runningGross = 0;
  const allGrossMonths = mergeMonthSeries(monthlyGrossAsset, monthlyManualGross);
  const portfolioGrowthGross: { month: string; valuePaise: number }[] = [];
  for (const row of allGrossMonths) {
    if (range.to && row.month > range.to.slice(0, 7)) break;
    runningGross += row.valuePaise;
    portfolioGrowthGross.push({ month: row.month, valuePaise: runningGross });
  }

  const periodRoiBusinessBps =
    purchaseVolumeRange > 0 ? (calcRoiBps(periodGross, purchaseVolumeRange) ?? 0) : 0;
  const periodRoiMyBps =
    capitalInjectedAll > 0 ? (calcRoiBps(periodMy, capitalInjectedAll) ?? 0) : 0;

  const profitGrowthPct = pctChange(periodMy, prevMy);

  const monthsWithProfit = monthlyMySeries.filter((m) => m.valuePaise !== 0);
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
    { label: 'Gross Profit', valuePaise: periodGross, kind: 'result' as const },
    { label: 'My Share', valuePaise: periodMy, kind: 'result' as const },
  ];

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
      periodGross !== 0 ||
      periodMy !== 0 ||
      purchaseVolumeRange > 0 ||
      capitalReturnedRange > 0 ||
      expensesRange > 0 ||
      saleProceedsRange > 0);

  const moneyReturnedRange = capitalReturnedRange + periodMy;

  return {
    range,
    isFuture: future,
    today,
    hero: {
      currentInvestmentPaise: currentInvestment,
      lifetimePurchaseVolumePaise: lifetimePurchaseVolume,
      grossBusinessProfitPaise: grossBusinessProfit,
      myLifetimeProfitPaise: myLifetimeProfit,
      businessRoiBps,
      myRoiBps,
    },
    secondary: {
      cashAvailablePaise: cashAvailable,
      activeVehicles,
      vehiclesSold: soldVehiclesLifetime,
      avgProfitPerVehiclePaise: avgMyProfitSold,
    },
    portfolioSummary: {
      lifetimePurchaseVolumePaise: lifetimePurchaseVolume,
      grossBusinessProfitPaise: grossBusinessProfit,
      myLifetimeProfitPaise: myLifetimeProfit,
      businessRoiBps,
      myRoiBps,
      vehiclesSold: soldVehiclesLifetime,
      avgProfitPerVehiclePaise: avgMyProfitSold,
      avgHoldingDays: avgHolding,
      capitalInvestedPaise: capitalInjectedAll,
    },
    period: {
      label: range.label,
      hasData: periodHasData,
      vehiclesPurchased: purchasesRange,
      vehiclesSold: soldVehiclesRange,
      moneyInvestedPaise: purchaseVolumeRange,
      moneyReturnedPaise: moneyReturnedRange,
      grossProfitPaise: periodGross,
      myProfitPaise: periodMy,
      repairsPaise: repairsRange || expensesRange,
      cashAvailablePaise: cashAvailable,
      currentInvestmentPaise: currentInvestment,
    },
    chartBlocks: {
      portfolioGrowth: {
        seriesMine: portfolioGrowth,
        seriesBusiness: portfolioGrowthGross,
        kpis: [
          {
            label: 'My Portfolio Value',
            valuePaise: portfolioGrowth.at(-1)?.valuePaise ?? myLifetimeProfit,
            kind: 'paise' as const,
          },
          {
            label: 'My Lifetime Profit',
            valuePaise: myLifetimeProfit,
            kind: 'paise' as const,
          },
          {
            label: 'My ROI',
            valueText: `${(myRoiBps / 100).toFixed(1)}%`,
            kind: 'text' as const,
          },
          {
            label: 'Business ROI',
            valueText: `${(businessRoiBps / 100).toFixed(1)}%`,
            kind: 'text' as const,
          },
        ],
      },
      monthlyProfit: {
        seriesMine: future ? [] : monthlyMySeries,
        seriesBusiness: future ? [] : monthlyGrossSeries,
        kpis: [
          {
            label: 'My Period Profit',
            valuePaise: periodMy,
            kind: 'paise' as const,
          },
          {
            label: 'Gross Period Profit',
            valuePaise: periodGross,
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
            label: 'Avg Monthly (Mine)',
            valuePaise: avgMonthlyProfit,
            kind: 'paise' as const,
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
            label: 'Gross Profit',
            valuePaise: periodGross,
            kind: 'paise' as const,
          },
          {
            label: 'My Share',
            valuePaise: periodMy,
            kind: 'paise' as const,
          },
          {
            label: 'Period My ROI',
            valueText: `${(periodRoiMyBps / 100).toFixed(1)}%`,
            kind: 'text' as const,
          },
        ],
      },
      roiCompare: {
        businessRoiBps,
        myRoiBps,
        periodBusinessRoiBps: periodRoiBusinessBps,
        periodMyRoiBps: periodRoiMyBps,
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

