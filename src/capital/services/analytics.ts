import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  sql,
  sum,
} from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import {
  acAssets,
  acAutomotiveDetails,
  acCapitalInvestments,
  acCategories,
  acExpenses,
  acPaymentsReceived,
} from '@/src/capital/db/schema';
import { monthlyManualProfitSeries, sumManualMySharePaise } from './manualProfits';
import { countOpenInventory, openInventorySql } from './inventory';
import { sumMyActiveInvestedCapitalPaise } from './assets';

/**
 * Dealership KPIs aligned with Overview / Dashboard SSOT (audit H4).
 * Active Capital = Me stakes on open vehicles — not treasury capital injects.
 */
export async function getDealershipReportKpis() {
  const [
    activeCapitalPaise,
    vehiclesInStock,
    soldCount,
    avgRoi,
    avgHolding,
    myShareRow,
    currentInvestmentRow,
    paymentRows,
  ] = await Promise.all([
    sumMyActiveInvestedCapitalPaise(),
    countOpenInventory(),
    capitalDb
      .select({ c: count() })
      .from(acAssets)
      .where(sql`${acAssets.status} IN ('sold', 'settled')`)
      .then((r) => r[0]),
    capitalDb
      .select({
        avgBusiness: sql<number>`COALESCE(AVG(COALESCE(${acAssets.businessRoiBps}, ${acAssets.roiBps})), 0)`,
        avgMine: sql<number>`COALESCE(AVG(${acAssets.myRoiBps}), 0)`,
      })
      .from(acAssets)
      .where(sql`${acAssets.roiBps} IS NOT NULL OR ${acAssets.businessRoiBps} IS NOT NULL`)
      .then((r) => r[0]),
    capitalDb
      .select({ avg: sql<number>`COALESCE(AVG(${acAssets.holdingDays}), 0)` })
      .from(acAssets)
      .where(sql`${acAssets.holdingDays} IS NOT NULL`)
      .then((r) => r[0]),
    capitalDb
      .select({ total: sum(acAssets.mySharePaise) })
      .from(acAssets)
      .where(sql`${acAssets.mySharePaise} IS NOT NULL AND ${acAssets.status} <> 'cancelled'`)
      .then((r) => r[0]),
    capitalDb
      .select({ total: sum(acAssets.totalInvestmentPaise) })
      .from(acAssets)
      .where(openInventorySql())
      .then((r) => r[0]),
    capitalDb
      .select({
        total: sum(acPaymentsReceived.amountPaise),
        capital: sum(acPaymentsReceived.capitalReturnedPaise),
        profit: sum(acPaymentsReceived.profitPaise),
      })
      .from(acPaymentsReceived)
      .where(eq(acPaymentsReceived.isReversed, false))
      .then((r) => r[0]),
  ]);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const yearStart = `${now.getFullYear()}-01-01`;

  const [monthProfitEntitled, yearProfitEntitled, manualMyShareAll, manualProfitMonth, manualProfitYear] =
    await Promise.all([
      capitalDb
        .select({ total: sum(acAssets.mySharePaise) })
        .from(acAssets)
        .where(
          and(
            sql`${acAssets.mySharePaise} IS NOT NULL`,
            sql`${acAssets.status} IN ('sold', 'settled')`,
            gte(acAssets.saleDate, monthStart),
          ),
        )
        .then((r) => Number(r[0]?.total ?? 0)),
      capitalDb
        .select({ total: sum(acAssets.mySharePaise) })
        .from(acAssets)
        .where(
          and(
            sql`${acAssets.mySharePaise} IS NOT NULL`,
            sql`${acAssets.status} IN ('sold', 'settled')`,
            gte(acAssets.saleDate, yearStart),
          ),
        )
        .then((r) => Number(r[0]?.total ?? 0)),
      sumManualMySharePaise(),
      sumManualMySharePaise({ from: monthStart }),
      sumManualMySharePaise({ from: yearStart }),
    ]);

  const myLifetimeProfit = Number(myShareRow?.total ?? 0) + manualMyShareAll;
  const currentInvestmentPaise = Number(currentInvestmentRow?.total ?? 0);
  const paymentProfit = Number(paymentRows?.profit ?? 0);

  const [pendingProfitSold] = await capitalDb
    .select({ total: sum(acAssets.mySharePaise) })
    .from(acAssets)
    .where(sql`${acAssets.status} IN ('sold', 'settled') AND ${acAssets.mySharePaise} IS NOT NULL`);

  return {
    /** Me stakes on open inventory — same as Dashboard Active Capital */
    activeCapitalPaise,
    /** @deprecated Prefer activeCapitalPaise — kept for older report labels */
    totalCapitalInvestedPaise: activeCapitalPaise,
    currentInvestmentPaise,
    capitalOutstandingPaise: currentInvestmentPaise,
    moneyReceivedPaise: Number(paymentRows?.total ?? 0) + manualMyShareAll,
    /** Entitled My Profit (deal shares + manuals), not cash payment profit */
    profitEarnedPaise: myLifetimeProfit,
    pendingProfitPaise: Math.max(0, Number(pendingProfitSold?.total ?? 0) - paymentProfit),
    assetsInStock: vehiclesInStock,
    assetsSold: Number(soldCount?.c ?? 0),
    averageRoiBps: Math.round(Number(avgRoi?.avgBusiness ?? 0)),
    averageMyRoiBps: Math.round(Number(avgRoi?.avgMine ?? 0)),
    averageHoldingDays: Math.round(Number(avgHolding?.avg ?? 0)),
    monthlyProfitPaise: monthProfitEntitled + manualProfitMonth,
    yearlyProfitPaise: yearProfitEntitled + manualProfitYear,
    lifetimeProfitPaise: myLifetimeProfit,
    monthlyCashPaise: Number(paymentRows?.total ?? 0),
    workingCapitalPaise: 0,
    freeCashPaise: 0,
  };
}

/** @deprecated Prefer getDealershipReportKpis — alias kept for existing imports */
export async function getDashboardKpis() {
  return getDealershipReportKpis();
}

export async function getMonthlyProfitChart() {
  const rows = await capitalDb
    .select({
      month: sql<string>`to_char(${acPaymentsReceived.receivedAt}::date, 'YYYY-MM')`,
      profit: sum(acPaymentsReceived.profitPaise),
    })
    .from(acPaymentsReceived)
    .where(eq(acPaymentsReceived.isReversed, false))
    .groupBy(sql`to_char(${acPaymentsReceived.receivedAt}::date, 'YYYY-MM')`)
    .orderBy(sql`to_char(${acPaymentsReceived.receivedAt}::date, 'YYYY-MM')`);

  const monthMap = new Map(
    rows.map((r) => [r.month, Number(r.profit ?? 0)] as const),
  );
  for (const m of await monthlyManualProfitSeries()) {
    monthMap.set(m.month, (monthMap.get(m.month) ?? 0) + m.valuePaise);
  }
  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, valuePaise]) => ({ month, valuePaise }));
}

export async function getCashFlowChart() {
  const inflows = await capitalDb
    .select({
      month: sql<string>`to_char(${acPaymentsReceived.receivedAt}::date, 'YYYY-MM')`,
      total: sum(acPaymentsReceived.amountPaise),
    })
    .from(acPaymentsReceived)
    .where(eq(acPaymentsReceived.isReversed, false))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const outflows = await capitalDb
    .select({
      month: sql<string>`to_char(${acCapitalInvestments.investedAt}::date, 'YYYY-MM')`,
      total: sum(acCapitalInvestments.amountPaise),
    })
    .from(acCapitalInvestments)
    .where(eq(acCapitalInvestments.isReversed, false))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const months = new Set([...inflows.map((r) => r.month), ...outflows.map((r) => r.month)]);
  return [...months].sort().map((month) => ({
    month,
    inflowPaise: Number(inflows.find((r) => r.month === month)?.total ?? 0),
    outflowPaise: Number(outflows.find((r) => r.month === month)?.total ?? 0),
  }));
}

export async function getInvestmentsChart() {
  const rows = await capitalDb
    .select({
      month: sql<string>`to_char(${acCapitalInvestments.investedAt}::date, 'YYYY-MM')`,
      total: sum(acCapitalInvestments.amountPaise),
    })
    .from(acCapitalInvestments)
    .where(eq(acCapitalInvestments.isReversed, false))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows.map((r) => ({ month: r.month, valuePaise: Number(r.total ?? 0) }));
}

export async function getExpensesByCategoryChart() {
  const rows = await capitalDb
    .select({
      label: acCategories.label,
      total: sum(acExpenses.amountPaise),
    })
    .from(acExpenses)
    .innerJoin(acCategories, eq(acExpenses.categoryId, acCategories.id))
    .where(eq(acExpenses.isReversed, false))
    .groupBy(acCategories.label)
    .orderBy(desc(sum(acExpenses.amountPaise)));
  return rows.map((r) => ({ label: r.label, valuePaise: Number(r.total ?? 0) }));
}

export async function getAssetsPurchasedChart() {
  const rows = await capitalDb
    .select({
      month: sql<string>`to_char(${acAssets.purchaseDate}::date, 'YYYY-MM')`,
      count: count(),
    })
    .from(acAssets)
    .groupBy(sql`to_char(${acAssets.purchaseDate}::date, 'YYYY-MM')`)
    .orderBy(sql`1`);
  return rows.map((r) => ({ month: r.month, count: Number(r.count) }));
}

export async function getAssetsSoldChart() {
  const rows = await capitalDb
    .select({
      month: sql<string>`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`,
      count: count(),
    })
    .from(acAssets)
    .where(sql`${acAssets.saleDate} IS NOT NULL`)
    .groupBy(sql`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`)
    .orderBy(sql`1`);
  return rows.map((r) => ({ month: r.month, count: Number(r.count) }));
}

export async function getRoiTrendChart() {
  const rows = await capitalDb
    .select({
      month: sql<string>`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`,
      avgMyRoi: sql<number>`COALESCE(AVG(${acAssets.myRoiBps}), 0)`,
    })
    .from(acAssets)
    .where(sql`${acAssets.saleDate} IS NOT NULL AND ${acAssets.myRoiBps} IS NOT NULL`)
    .groupBy(sql`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`)
    .orderBy(sql`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`);
  return rows.map((r) => ({
    month: r.month,
    myRoiBps: Math.round(Number(r.avgMyRoi)),
  }));
}

export async function getHoldingTimeChart() {
  const rows = await capitalDb
    .select({
      month: sql<string>`to_char(${acAssets.saleDate}::date, 'YYYY-MM')`,
      avgDays: sql<number>`COALESCE(AVG(${acAssets.holdingDays}), 0)`,
    })
    .from(acAssets)
    .where(sql`${acAssets.saleDate} IS NOT NULL`)
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows.map((r) => ({ month: r.month, days: Math.round(Number(r.avgDays)) }));
}

export async function getManufacturerPerformance() {
  const rows = await capitalDb
    .select({
      manufacturer: acAutomotiveDetails.manufacturer,
      avgMyRoi: sql<number>`COALESCE(AVG(${acAssets.myRoiBps}), 0)`,
      count: count(),
      totalMyShare: sum(acAssets.mySharePaise),
    })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(sql`${acAssets.mySharePaise} IS NOT NULL`)
    .groupBy(acAutomotiveDetails.manufacturer)
    .orderBy(desc(sql`COALESCE(SUM(${acAssets.mySharePaise}), 0)`));
  return rows.map((r) => ({
    manufacturer: r.manufacturer,
    avgMyRoiBps: Math.round(Number(r.avgMyRoi)),
    count: Number(r.count),
    totalMySharePaise: Number(r.totalMyShare ?? 0),
  }));
}

/** In-stock holding buckets for inventory ageing. */
export async function getInventoryAgeing() {
  const rows = await capitalDb
    .select({
      holdingDays: acAssets.holdingDays,
    })
    .from(acAssets)
    .where(openInventorySql());

  const buckets = [
    { label: '0–30 days', min: 0, max: 30, count: 0 },
    { label: '31–60 days', min: 31, max: 60, count: 0 },
    { label: '61–90 days', min: 61, max: 90, count: 0 },
    { label: '90+ days', min: 91, max: Number.POSITIVE_INFINITY, count: 0 },
  ];
  for (const row of rows) {
    const d = Number(row.holdingDays ?? 0);
    const bucket = buckets.find((b) => d >= b.min && d <= b.max);
    if (bucket) bucket.count += 1;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}

/** Repair spend by purchase/sale month using stored repair totals on sold + active. */
export async function getRepairTrends() {
  const rows = await capitalDb
    .select({
      month: sql<string>`to_char(COALESCE(${acAssets.saleDate}, ${acAssets.purchaseDate})::date, 'YYYY-MM')`,
      total: sum(acAssets.repairTotalPaise),
    })
    .from(acAssets)
    .where(sql`${acAssets.status} <> 'cancelled' AND ${acAssets.repairTotalPaise} > 0`)
    .groupBy(sql`to_char(COALESCE(${acAssets.saleDate}, ${acAssets.purchaseDate})::date, 'YYYY-MM')`)
    .orderBy(sql`1`);
  return rows.map((r) => ({ month: r.month, valuePaise: Number(r.total ?? 0) }));
}

/** Acquisition: vehicles bought + purchase capital by month. */
export async function getAcquisitionTrends() {
  const rows = await capitalDb
    .select({
      month: sql<string>`to_char(${acAssets.purchaseDate}::date, 'YYYY-MM')`,
      count: count(),
      volume: sum(acAssets.purchasePricePaise),
    })
    .from(acAssets)
    .where(sql`${acAssets.status} <> 'cancelled'`)
    .groupBy(sql`to_char(${acAssets.purchaseDate}::date, 'YYYY-MM')`)
    .orderBy(sql`1`);
  return rows.map((r) => ({
    month: r.month,
    count: Number(r.count),
    volumePaise: Number(r.volume ?? 0),
  }));
}

/** My profit distribution across sold vehicles (bucketed). */
export async function getProfitDistribution() {
  const rows = await capitalDb
    .select({ mySharePaise: acAssets.mySharePaise })
    .from(acAssets)
    .where(sql`${acAssets.mySharePaise} IS NOT NULL AND ${acAssets.status} <> 'cancelled'`);

  const buckets = [
    { label: 'Loss', min: Number.NEGATIVE_INFINITY, max: -1, count: 0 },
    { label: '₹0–50k', min: 0, max: 50_000_00, count: 0 },
    { label: '₹50k–1L', min: 50_000_01, max: 1_00_000_00, count: 0 },
    { label: '₹1L–2L', min: 1_00_000_01, max: 2_00_000_00, count: 0 },
    { label: '₹2L+', min: 2_00_000_01, max: Number.POSITIVE_INFINITY, count: 0 },
  ];
  for (const row of rows) {
    const p = Number(row.mySharePaise ?? 0);
    const bucket = buckets.find((b) => p >= b.min && p <= b.max);
    if (bucket) bucket.count += 1;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}

/** Fuel type performance (My share + My ROI). */
export async function getFuelTypePerformance() {
  const rows = await capitalDb
    .select({
      fuelType: acAutomotiveDetails.fuelType,
      count: count(),
      avgMyRoi: sql<number>`COALESCE(AVG(${acAssets.myRoiBps}), 0)`,
      totalMyShare: sum(acAssets.mySharePaise),
    })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(sql`${acAssets.mySharePaise} IS NOT NULL`)
    .groupBy(acAutomotiveDetails.fuelType)
    .orderBy(desc(sql`COALESCE(SUM(${acAssets.mySharePaise}), 0)`));
  return rows.map((r) => ({
    fuelType: r.fuelType ?? 'unknown',
    count: Number(r.count),
    avgMyRoiBps: Math.round(Number(r.avgMyRoi)),
    totalMySharePaise: Number(r.totalMyShare ?? 0),
  }));
}

/** Model year performance (My share). */
export async function getYearPerformance() {
  const rows = await capitalDb
    .select({
      year: acAutomotiveDetails.year,
      count: count(),
      avgMyRoi: sql<number>`COALESCE(AVG(${acAssets.myRoiBps}), 0)`,
      totalMyShare: sum(acAssets.mySharePaise),
    })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(sql`${acAssets.mySharePaise} IS NOT NULL`)
    .groupBy(acAutomotiveDetails.year)
    .orderBy(desc(acAutomotiveDetails.year));
  return rows.map((r) => ({
    year: Number(r.year),
    count: Number(r.count),
    avgMyRoiBps: Math.round(Number(r.avgMyRoi)),
    totalMySharePaise: Number(r.totalMyShare ?? 0),
  }));
}

/** Top / bottom vehicles by My share. */
export async function getVehiclePerformance() {
  const best = await capitalDb
    .select({
      id: acAssets.id,
      displayName: acAssets.displayName,
      mySharePaise: acAssets.mySharePaise,
      myRoiBps: acAssets.myRoiBps,
      holdingDays: acAssets.holdingDays,
    })
    .from(acAssets)
    .where(sql`${acAssets.mySharePaise} IS NOT NULL`)
    .orderBy(desc(acAssets.mySharePaise))
    .limit(5);

  const worst = await capitalDb
    .select({
      id: acAssets.id,
      displayName: acAssets.displayName,
      mySharePaise: acAssets.mySharePaise,
      myRoiBps: acAssets.myRoiBps,
      holdingDays: acAssets.holdingDays,
    })
    .from(acAssets)
    .where(sql`${acAssets.mySharePaise} IS NOT NULL`)
    .orderBy(asc(acAssets.mySharePaise))
    .limit(5);

  return { best, worst };
}

export async function getAnalyticsInsightKpis() {
  const [avgHolding] = await capitalDb
    .select({ avg: sql<number>`COALESCE(AVG(${acAssets.holdingDays}), 0)` })
    .from(acAssets)
    .where(sql`${acAssets.holdingDays} IS NOT NULL AND ${acAssets.status} IN ('sold', 'settled')`);

  const [avgMyRoi] = await capitalDb
    .select({ avg: sql<number>`COALESCE(AVG(${acAssets.myRoiBps}), 0)` })
    .from(acAssets)
    .where(sql`${acAssets.myRoiBps} IS NOT NULL`);

  const [ageing] = await capitalDb
    .select({ c: count() })
    .from(acAssets)
    .where(and(openInventorySql(), sql`COALESCE(${acAssets.holdingDays}, 0) > 90`));

  const [repairOpen] = await capitalDb
    .select({ total: sum(acAssets.repairTotalPaise) })
    .from(acAssets)
    .where(sql`${acAssets.status} IN ('repairing', 'painting')`);

  return {
    averageHoldingDays: Math.round(Number(avgHolding?.avg ?? 0)),
    averageMyRoiBps: Math.round(Number(avgMyRoi?.avg ?? 0)),
    staleInventoryCount: Number(ageing?.c ?? 0),
    repairSpendOnActivePaise: Number(repairOpen?.total ?? 0),
  };
}

export async function getAnalyticsBundle() {
  const [
    cashFlow,
    roiTrend,
    holdingTime,
    manufacturers,
    inventoryAgeing,
    repairTrends,
    acquisition,
    profitDistribution,
    fuelPerformance,
    yearPerformance,
    vehiclePerformance,
    insightKpis,
  ] = await Promise.all([
    getCashFlowChart(),
    getRoiTrendChart(),
    getHoldingTimeChart(),
    getManufacturerPerformance(),
    getInventoryAgeing(),
    getRepairTrends(),
    getAcquisitionTrends(),
    getProfitDistribution(),
    getFuelTypePerformance(),
    getYearPerformance(),
    getVehiclePerformance(),
    getAnalyticsInsightKpis(),
  ]);
  return {
    cashFlow,
    roiTrend,
    holdingTime,
    manufacturers,
    inventoryAgeing,
    repairTrends,
    acquisition,
    profitDistribution,
    fuelPerformance,
    yearPerformance,
    vehiclePerformance,
    insightKpis,
  };
}
