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
import {
  isFutureRange,
  isoDate,
  pctChange,
  previousPeriod,
  shiftMonth,
  type DateRange,
  type DashboardRange,
} from '@/src/capital/lib/dashboardRange';
import { computePortfolioRois } from '@/src/capital/lib/roi';
import { monthlyManualProfitSeries, sumManualMySharePaise, sumManualProfitsPaise } from './manualProfits';
import { sumMyInvestedCapitalPaise } from './assets';

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

/** Σ net vehicle cost (purchase + signed expenses) for sold/settled deals — Business ROI base */
async function sumSoldVehicleCost(range?: DateRange): Promise<number> {
  const conditions = [sql`${acAssets.status} IN ('sold', 'settled')`];
  if (range?.from) conditions.push(gte(acAssets.saleDate, range.from));
  if (range?.to) conditions.push(lte(acAssets.saleDate, range.to));
  const [row] = await capitalDb
    .select({ total: sum(acAssets.totalInvestmentPaise) })
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
    myVehicleCapitalAll,
    lifetimePurchaseVolume,
    soldVehicleCostAll,
    grossAssetProfitAll,
    myAssetShareAll,
    grossAssetProfitRange,
    myAssetShareRange,
    grossAssetProfitPrev,
    myAssetSharePrev,
    manualGrossAll,
    manualMyAll,
    manualGrossRange,
    manualMyRange,
    manualGrossPrev,
    manualMyPrev,
    purchaseVolumeRange,
    soldVehicleCostRange,
    currentInvestment,
    activeVehicles,
    soldVehiclesLifetime,
    soldVehiclesRange,
    purchasesRange,
    avgMyProfitSold,
    avgGrossProfitSold,
    avgHolding,
    capitalReturnedRange,
    repairsRange,
    expensesRange,
    saleProceedsRange,
    monthlyGrossAsset,
    monthlyMyAsset,
    monthlyManualGross,
    monthlyManualMine,
    monthlyRoiBusiness,
    monthlyRoiMine,
    monthlyPurchases,
    activity,
    _capitalInTransitSold,
    activeByStatus,
  ] = await Promise.all([
    sumCapitalInvested(),
    sumMyInvestedCapitalPaise(),
    sumPurchaseVolume(),
    sumSoldVehicleCost(),
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
      .select({ total: sum(acAssets.profitPaise) })
      .from(acAssets)
      .where(
        and(
          sql`${acAssets.profitPaise} IS NOT NULL AND ${acAssets.status} <> 'cancelled'`,
          prev.from ? gte(acAssets.saleDate, prev.from) : sql`true`,
          prev.to ? lte(acAssets.saleDate, prev.to) : sql`true`,
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
    sumManualProfitsPaise({ from: prev.from, to: prev.to }),
    sumManualMySharePaise({ from: prev.from, to: prev.to }),
    future ? Promise.resolve(0) : sumPurchaseVolume(range),
    future ? Promise.resolve(0) : sumSoldVehicleCost(range),
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
        month: sql<string>`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`,
        avgRoi: sql<number>`COALESCE(AVG(COALESCE(${acAssets.businessRoiBps}, ${acAssets.roiBps})), 0)`,
      })
      .from(acAssets)
      .where(
        sql`${acAssets.saleDate} IS NOT NULL AND COALESCE(${acAssets.businessRoiBps}, ${acAssets.roiBps}) IS NOT NULL`,
      )
      .groupBy(sql`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`)
      .then((rows) =>
        rows.map((r) => ({ month: r.month, roiBps: Math.round(Number(r.avgRoi)) })),
      ),
    capitalDb
      .select({
        month: sql<string>`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`,
        avgRoi: sql<number>`COALESCE(AVG(${acAssets.myRoiBps}), 0)`,
      })
      .from(acAssets)
      .where(sql`${acAssets.saleDate} IS NOT NULL AND ${acAssets.myRoiBps} IS NOT NULL`)
      .groupBy(sql`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`)
      .then((rows) =>
        rows.map((r) => ({ month: r.month, roiBps: Math.round(Number(r.avgRoi)) })),
      ),
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
      .select({ total: sum(acAssets.outstandingPaise) })
      .from(acAssets)
      .where(sql`${acAssets.status} = 'sold'`)
      .then((r) => Number(r[0]?.total ?? 0)),
    capitalDb
      .select({
        status: acAssets.status,
        total: sum(acAssets.totalInvestmentPaise),
      })
      .from(acAssets)
      .where(sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`)
      .groupBy(acAssets.status),
  ]);

  const grossBusinessProfit = grossAssetProfitAll + manualGrossAll;
  const myLifetimeProfit = myAssetShareAll + manualMyAll;
  /** Partner share is residual — never use my figures as business profit */
  const partnerLifetimeProfit = Math.max(0, grossBusinessProfit - myLifetimeProfit);
  const periodGross = grossAssetProfitRange + manualGrossRange;
  const periodMy = myAssetShareRange + manualMyRange;
  const prevMy = myAssetSharePrev + manualMyPrev;
  const prevGross = grossAssetProfitPrev + manualGrossPrev;

  if (
    process.env.NODE_ENV !== 'production' &&
    partnerLifetimeProfit > 0 &&
    grossBusinessProfit === myLifetimeProfit
  ) {
    console.warn(
      '[capital overview] Business profit equals My profit while partner share > 0 — check profit_paise vs my_share_paise',
    );
  }

  // Business ROI = Gross Business Profit ÷ Σ total vehicle cost (sold/settled)
  // My ROI = My Profit ÷ My vehicle capital stakes (never full cost unless I funded 100%)
  const { businessRoiBps, myRoiBps } = computePortfolioRois({
    grossBusinessProfitPaise: grossBusinessProfit,
    myProfitPaise: myLifetimeProfit,
    totalVehicleCostPaise: soldVehicleCostAll > 0 ? soldVehicleCostAll : lifetimePurchaseVolume,
    myCapitalInvestedPaise: myVehicleCapitalAll > 0 ? myVehicleCapitalAll : capitalInjectedAll,
  });

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

  const clipRoiSeries = (series: { month: string; roiBps: number }[]) => {
    let next = series;
    if (range.to) next = next.filter((m) => m.month <= range.to!.slice(0, 7));
    if (range.from && range.key !== 'all' && range.key !== 'month') {
      next = next.filter((m) => m.month >= range.from!.slice(0, 7));
    }
    if (range.key === 'month' && range.month) {
      const end = range.month;
      const start = shiftMonth(end, -11);
      const map = new Map(series.map((m) => [m.month, m.roiBps]));
      next = [...Array(12)]
        .map((_, i) => {
          const month = shiftMonth(start, i);
          return { month, roiBps: map.get(month) ?? 0 };
        })
        .filter((m) => m.month <= end);
    }
    return next;
  };

  monthlyGrossSeries = clipSeries(monthlyGrossSeries);
  monthlyMySeries = clipSeries(monthlyMySeries);
  const monthlyRoiBusinessClipped = clipRoiSeries(monthlyRoiBusiness);
  const monthlyRoiMineClipped = clipRoiSeries(monthlyRoiMine);

  // Portfolio growth = cumulative profit (mode-specific series)
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

  const periodRoiBundle = computePortfolioRois({
    grossBusinessProfitPaise: periodGross,
    myProfitPaise: periodMy,
    totalVehicleCostPaise:
      soldVehicleCostRange > 0 ? soldVehicleCostRange : purchaseVolumeRange,
    // Period personal base: scale my stakes by period cost share when possible
    myCapitalInvestedPaise:
      soldVehicleCostAll > 0 && myVehicleCapitalAll > 0 && soldVehicleCostRange > 0
        ? Math.round((myVehicleCapitalAll * soldVehicleCostRange) / soldVehicleCostAll)
        : lifetimePurchaseVolume > 0 && myVehicleCapitalAll > 0
          ? Math.round((myVehicleCapitalAll * purchaseVolumeRange) / lifetimePurchaseVolume)
          : purchaseVolumeRange,
  });
  const periodRoiBusinessBps = periodRoiBundle.businessRoiBps;
  const periodRoiMyBps = periodRoiBundle.myRoiBps;

  const myProfitGrowthPct = pctChange(periodMy, prevMy);
  const businessProfitGrowthPct = pctChange(periodGross, prevGross);

  const monthsWithMyProfit = monthlyMySeries.filter((m) => m.valuePaise !== 0);
  const avgMonthlyMyProfit =
    monthsWithMyProfit.length > 0
      ? Math.round(
          monthsWithMyProfit.reduce((s, m) => s + m.valuePaise, 0) / monthsWithMyProfit.length,
        )
      : 0;
  const monthsWithGrossProfit = monthlyGrossSeries.filter((m) => m.valuePaise !== 0);
  const avgMonthlyGrossProfit =
    monthsWithGrossProfit.length > 0
      ? Math.round(
          monthsWithGrossProfit.reduce((s, m) => s + m.valuePaise, 0) /
            monthsWithGrossProfit.length,
        )
      : 0;

  // Allocation = locked capital by vehicle status only (no free cash / working capital)
  const allocation = activeByStatus
    .map((row) => ({
      label: String(row.status).replace(/_/g, ' '),
      valuePaise: Number(row.total ?? 0),
    }))
    .filter((a) => a.valuePaise > 0);

  const waterfallBase = [
    { label: 'Purchases', valuePaise: purchaseVolumeRange, kind: 'out' as const },
    { label: 'Repairs', valuePaise: repairsRange || expensesRange, kind: 'out' as const },
    { label: 'Sale Proceeds', valuePaise: saleProceedsRange, kind: 'in' as const },
  ];
  const waterfallMine = [
    ...waterfallBase,
    { label: 'My Profit', valuePaise: periodMy, kind: 'result' as const },
  ];
  const waterfallBusiness = [
    ...waterfallBase,
    { label: 'Business Profit', valuePaise: periodGross, kind: 'result' as const },
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

  const growthTrend = (pct: number | null) =>
    pct == null
      ? ('neutral' as const)
      : pct > 0
        ? ('up' as const)
        : pct < 0
          ? ('down' as const)
          : ('neutral' as const);

  const growthText = (pct: number | null) =>
    pct == null ? '—' : `${pct > 0 ? '+' : ''}${pct}%`;

  return {
    range,
    isFuture: future,
    today,
    shared: {
      currentInvestmentPaise: currentInvestment,
      activeVehicles,
      vehiclesSold: soldVehiclesLifetime,
      avgHoldingDays: avgHolding,
    },
    /** Dual financial views — toggle switches the entire dashboard between these */
    views: {
      mine: {
        profitPaise: myLifetimeProfit,
        partnerProfitPaise: partnerLifetimeProfit,
        roiBps: myRoiBps,
        avgProfitPerVehiclePaise: avgMyProfitSold,
        periodProfitPaise: periodMy,
        periodRoiBps: periodRoiMyBps,
        profitGrowthPct: myProfitGrowthPct,
        avgMonthlyProfitPaise: avgMonthlyMyProfit,
        portfolioGrowth: portfolioGrowth,
        monthlyProfit: future ? [] : monthlyMySeries,
        monthlyRoi: future ? [] : monthlyRoiMineClipped,
        waterfall: future ? [] : waterfallMine,
        allocation,
      },
      business: {
        /** ALWAYS gross before distribution — never myShare */
        profitPaise: grossBusinessProfit,
        partnerProfitPaise: partnerLifetimeProfit,
        myProfitPaise: myLifetimeProfit,
        roiBps: businessRoiBps,
        avgProfitPerVehiclePaise: avgGrossProfitSold,
        periodProfitPaise: periodGross,
        periodRoiBps: periodRoiBusinessBps,
        profitGrowthPct: businessProfitGrowthPct,
        avgMonthlyProfitPaise: avgMonthlyGrossProfit,
        portfolioGrowth: portfolioGrowthGross,
        monthlyProfit: future ? [] : monthlyGrossSeries,
        monthlyRoi: future ? [] : monthlyRoiBusinessClipped,
        waterfall: future ? [] : waterfallBusiness,
        allocation,
      },
    },
    period: {
      label: range.label,
      hasData: periodHasData,
      vehiclesPurchased: purchasesRange,
      vehiclesSold: soldVehiclesRange,
      moneyInvestedPaise: purchaseVolumeRange,
      capitalRecoveredPaise: capitalReturnedRange,
      repairsPaise: repairsRange || expensesRange,
      currentInvestmentPaise: currentInvestment,
    },
    chartBlocks: {
      capitalAllocation: {
        series: allocation,
      },
      portfolioGrowth: {
        seriesMine: portfolioGrowth,
        seriesBusiness: portfolioGrowthGross,
      },
      monthlyProfit: {
        seriesMine: future ? [] : monthlyMySeries,
        seriesBusiness: future ? [] : monthlyGrossSeries,
      },
      monthlyRoi: {
        seriesMine: future ? [] : monthlyRoiMineClipped,
        seriesBusiness: future ? [] : monthlyRoiBusinessClipped,
      },
      waterfall: {
        seriesMine: future ? [] : waterfallMine,
        seriesBusiness: future ? [] : waterfallBusiness,
      },
      sideKpis: {
        mine: {
          portfolioGrowth: [
            {
              label: 'My Profit',
              valuePaise: myLifetimeProfit,
              kind: 'paise' as const,
            },
            {
              label: 'My ROI',
              valueText: `${(myRoiBps / 100).toFixed(1)}%`,
              kind: 'text' as const,
            },
            {
              label: 'Vehicles Sold',
              valueText: String(soldVehiclesLifetime),
              kind: 'text' as const,
            },
            {
              label: 'Avg Profit / Vehicle',
              valuePaise: avgMyProfitSold,
              kind: 'paise' as const,
            },
          ],
          monthlyProfit: [
            {
              label: 'My Period Profit',
              valuePaise: periodMy,
              kind: 'paise' as const,
            },
            {
              label: 'Profit Growth',
              valueText: growthText(myProfitGrowthPct),
              kind: 'text' as const,
              trend: growthTrend(myProfitGrowthPct),
            },
            {
              label: 'Avg Monthly (Mine)',
              valuePaise: avgMonthlyMyProfit,
              kind: 'paise' as const,
            },
            {
              label: 'Period My ROI',
              valueText: `${(periodRoiMyBps / 100).toFixed(1)}%`,
              kind: 'text' as const,
            },
          ],
          monthlyRoi: [
            {
              label: 'My ROI',
              valueText: `${(myRoiBps / 100).toFixed(1)}%`,
              kind: 'text' as const,
            },
            {
              label: 'Period My ROI',
              valueText: `${(periodRoiMyBps / 100).toFixed(1)}%`,
              kind: 'text' as const,
            },
            {
              label: 'My Profit',
              valuePaise: myLifetimeProfit,
              kind: 'paise' as const,
            },
            {
              label: 'Avg Profit / Vehicle',
              valuePaise: avgMyProfitSold,
              kind: 'paise' as const,
            },
          ],
          waterfall: [
            {
              label: 'Purchases',
              valuePaise: purchaseVolumeRange,
              kind: 'paise' as const,
            },
            {
              label: 'My Profit',
              valuePaise: periodMy,
              kind: 'paise' as const,
            },
            {
              label: 'Period My ROI',
              valueText: `${(periodRoiMyBps / 100).toFixed(1)}%`,
              kind: 'text' as const,
            },
            {
              label: 'Repairs',
              valuePaise: repairsRange || expensesRange,
              kind: 'paise' as const,
            },
          ],
          allocation: [
            {
              label: 'Current Investment',
              valuePaise: currentInvestment,
              kind: 'paise' as const,
            },
            {
              label: 'Active Vehicles',
              valueText: String(activeVehicles),
              kind: 'text' as const,
            },
            {
              label: 'My Profit',
              valuePaise: myLifetimeProfit,
              kind: 'paise' as const,
            },
            {
              label: 'My ROI',
              valueText: `${(myRoiBps / 100).toFixed(1)}%`,
              kind: 'text' as const,
            },
          ],
        },
        business: {
          portfolioGrowth: [
            {
              label: 'Business Profit',
              valuePaise: grossBusinessProfit,
              kind: 'paise' as const,
            },
            {
              label: 'Partner Profit',
              valuePaise: partnerLifetimeProfit,
              kind: 'paise' as const,
            },
            {
              label: 'Business ROI',
              valueText: `${(businessRoiBps / 100).toFixed(1)}%`,
              kind: 'text' as const,
            },
            {
              label: 'Avg Profit / Vehicle',
              valuePaise: avgGrossProfitSold,
              kind: 'paise' as const,
            },
          ],
          monthlyProfit: [
            {
              label: 'Business Period Profit',
              valuePaise: periodGross,
              kind: 'paise' as const,
            },
            {
              label: 'Profit Growth',
              valueText: growthText(businessProfitGrowthPct),
              kind: 'text' as const,
              trend: growthTrend(businessProfitGrowthPct),
            },
            {
              label: 'Avg Monthly (Business)',
              valuePaise: avgMonthlyGrossProfit,
              kind: 'paise' as const,
            },
            {
              label: 'Period Business ROI',
              valueText: `${(periodRoiBusinessBps / 100).toFixed(1)}%`,
              kind: 'text' as const,
            },
          ],
          monthlyRoi: [
            {
              label: 'Business ROI',
              valueText: `${(businessRoiBps / 100).toFixed(1)}%`,
              kind: 'text' as const,
            },
            {
              label: 'Period Business ROI',
              valueText: `${(periodRoiBusinessBps / 100).toFixed(1)}%`,
              kind: 'text' as const,
            },
            {
              label: 'Business Profit',
              valuePaise: grossBusinessProfit,
              kind: 'paise' as const,
            },
            {
              label: 'Partner Profit',
              valuePaise: partnerLifetimeProfit,
              kind: 'paise' as const,
            },
          ],
          waterfall: [
            {
              label: 'Purchases',
              valuePaise: purchaseVolumeRange,
              kind: 'paise' as const,
            },
            {
              label: 'Business Profit',
              valuePaise: periodGross,
              kind: 'paise' as const,
            },
            {
              label: 'Period Business ROI',
              valueText: `${(periodRoiBusinessBps / 100).toFixed(1)}%`,
              kind: 'text' as const,
            },
            {
              label: 'Repairs',
              valuePaise: repairsRange || expensesRange,
              kind: 'paise' as const,
            },
          ],
          allocation: [
            {
              label: 'Current Investment',
              valuePaise: currentInvestment,
              kind: 'paise' as const,
            },
            {
              label: 'Active Vehicles',
              valueText: String(activeVehicles),
              kind: 'text' as const,
            },
            {
              label: 'Business Profit',
              valuePaise: grossBusinessProfit,
              kind: 'paise' as const,
            },
            {
              label: 'Business ROI',
              valueText: `${(businessRoiBps / 100).toFixed(1)}%`,
              kind: 'text' as const,
            },
          ],
        },
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

