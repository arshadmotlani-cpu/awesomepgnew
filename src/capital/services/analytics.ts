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
import { unstable_cache } from 'next/cache';
import { capitalDb } from '@/src/capital/db/client';
import {
  acAssets,
  acAutomotiveDetails,
  acCapitalInvestments,
  acCategories,
  acExpenses,
  acPaymentsReceived,
} from '@/src/capital/db/schema';

async function computeDashboardKpis() {
  const [capitalRow] = await capitalDb
    .select({ total: sum(acCapitalInvestments.amountPaise) })
    .from(acCapitalInvestments)
    .where(eq(acCapitalInvestments.isReversed, false));

  const [paymentRows] = await capitalDb
    .select({
      total: sum(acPaymentsReceived.amountPaise),
      capital: sum(acPaymentsReceived.capitalReturnedPaise),
      profit: sum(acPaymentsReceived.profitPaise),
    })
    .from(acPaymentsReceived)
    .where(eq(acPaymentsReceived.isReversed, false));

  const [stockCount] = await capitalDb
    .select({ c: count() })
    .from(acAssets)
    .where(sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`);

  const [soldCount] = await capitalDb
    .select({ c: count() })
    .from(acAssets)
    .where(sql`${acAssets.status} IN ('sold', 'settled')`);

  const [avgRoi] = await capitalDb
    .select({ avg: sql<number>`COALESCE(AVG(${acAssets.roiBps}), 0)` })
    .from(acAssets)
    .where(sql`${acAssets.roiBps} IS NOT NULL`);

  const [avgHolding] = await capitalDb
    .select({ avg: sql<number>`COALESCE(AVG(${acAssets.holdingDays}), 0)` })
    .from(acAssets)
    .where(sql`${acAssets.holdingDays} IS NOT NULL`);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const yearStart = `${now.getFullYear()}-01-01`;

  const [monthProfit] = await capitalDb
    .select({ total: sum(acPaymentsReceived.profitPaise) })
    .from(acPaymentsReceived)
    .where(and(eq(acPaymentsReceived.isReversed, false), gte(acPaymentsReceived.receivedAt, monthStart)));

  const [yearProfit] = await capitalDb
    .select({ total: sum(acPaymentsReceived.profitPaise) })
    .from(acPaymentsReceived)
    .where(and(eq(acPaymentsReceived.isReversed, false), gte(acPaymentsReceived.receivedAt, yearStart)));

  const [monthCash] = await capitalDb
    .select({ total: sum(acPaymentsReceived.amountPaise) })
    .from(acPaymentsReceived)
    .where(and(eq(acPaymentsReceived.isReversed, false), gte(acPaymentsReceived.receivedAt, monthStart)));

  const totalCapital = Number(capitalRow?.total ?? 0);
  const capitalReturned = Number(paymentRows?.capital ?? 0);
  const profitEarned = Number(paymentRows?.profit ?? 0);
  const moneyReceived = Number(paymentRows?.total ?? 0);

  const [pendingProfitSold] = await capitalDb
    .select({ total: sum(acAssets.profitPaise) })
    .from(acAssets)
    .where(sql`${acAssets.status} IN ('sold', 'settled') AND ${acAssets.profitPaise} IS NOT NULL`);

  const pendingProfitPaise = Math.max(0, Number(pendingProfitSold?.total ?? 0) - profitEarned);

  return {
    totalCapitalInvestedPaise: totalCapital,
    capitalOutstandingPaise: Math.max(0, totalCapital - capitalReturned),
    moneyReceivedPaise: moneyReceived,
    profitEarnedPaise: profitEarned,
    pendingProfitPaise,
    assetsInStock: Number(stockCount?.c ?? 0),
    assetsSold: Number(soldCount?.c ?? 0),
    averageRoiBps: Math.round(Number(avgRoi?.avg ?? 0)),
    averageHoldingDays: Math.round(Number(avgHolding?.avg ?? 0)),
    monthlyProfitPaise: Number(monthProfit?.total ?? 0),
    yearlyProfitPaise: Number(yearProfit?.total ?? 0),
    lifetimeProfitPaise: profitEarned,
    monthlyCashPaise: Number(monthCash?.total ?? 0),
  };
}

export const getDashboardKpis = unstable_cache(computeDashboardKpis, ['capital-dashboard-kpis'], {
  revalidate: 60,
  tags: ['capital-dashboard'],
});

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
  return rows.map((r) => ({ month: r.month, valuePaise: Number(r.profit ?? 0) }));
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
      avgRoi: sql<number>`COALESCE(AVG(${acAssets.roiBps}), 0)`,
    })
    .from(acAssets)
    .where(sql`${acAssets.saleDate} IS NOT NULL AND ${acAssets.roiBps} IS NOT NULL`)
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows.map((r) => ({ month: r.month, roiBps: Math.round(Number(r.avgRoi)) }));
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
      avgRoi: sql<number>`COALESCE(AVG(${acAssets.roiBps}), 0)`,
      count: count(),
      totalProfit: sum(acAssets.profitPaise),
    })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(sql`${acAssets.profitPaise} IS NOT NULL`)
    .groupBy(acAutomotiveDetails.manufacturer)
    .orderBy(desc(sql`COALESCE(AVG(${acAssets.roiBps}), 0)`));
  return rows.map((r) => ({
    manufacturer: r.manufacturer,
    avgRoiBps: Math.round(Number(r.avgRoi)),
    count: Number(r.count),
    totalProfitPaise: Number(r.totalProfit ?? 0),
  }));
}

export async function getInsights() {
  const staleAssets = await capitalDb
    .select({ asset: acAssets, auto: acAutomotiveDetails })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(
      and(
        sql`${acAssets.holdingDays} > 90`,
        sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`,
      ),
    )
    .limit(5);

  const noMovement = await capitalDb
    .select({ asset: acAssets, auto: acAutomotiveDetails })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(
      and(
        sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`,
        sql`NOT EXISTS (
          SELECT 1 FROM ac_expenses e
          WHERE e.asset_id = ${acAssets.id}
          AND e.expense_date >= (CURRENT_DATE - INTERVAL '30 days')::date
          AND e.is_reversed = false
        )`,
      ),
    )
    .limit(5);

  const pendingSettlements = await capitalDb
    .select({ asset: acAssets, auto: acAutomotiveDetails })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(
      and(
        eq(acAssets.status, 'sold'),
        sql`COALESCE(${acAssets.settlementPctBps}, 0) < 10000`,
      ),
    )
    .limit(5);

  const [bestProfit] = await capitalDb
    .select({ asset: acAssets, auto: acAutomotiveDetails })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(sql`${acAssets.profitPaise} IS NOT NULL`)
    .orderBy(desc(acAssets.profitPaise))
    .limit(1);

  const [worstProfit] = await capitalDb
    .select({ asset: acAssets, auto: acAutomotiveDetails })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(sql`${acAssets.profitPaise} IS NOT NULL`)
    .orderBy(asc(acAssets.profitPaise))
    .limit(1);

  const mfg = await getManufacturerPerformance();
  const bestMfg = mfg[0] ?? null;
  const worstMfg = mfg.length > 1 ? mfg[mfg.length - 1] : null;

  const [capitalLocked] = await capitalDb
    .select({ total: sum(acAssets.outstandingPaise) })
    .from(acAssets)
    .where(sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`);

  const expectedReturns = await capitalDb
    .select({ asset: acAssets, auto: acAutomotiveDetails })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(
      and(
        eq(acAssets.status, 'listed'),
        sql`${acAssets.expectedSalePricePaise} IS NOT NULL`,
      ),
    )
    .limit(5);

  return {
    staleAssets,
    noMovement,
    pendingSettlements,
    bestProfit: bestProfit ?? null,
    worstProfit: worstProfit ?? null,
    bestManufacturer: bestMfg,
    worstManufacturer: worstMfg,
    capitalLockedPaise: Number(capitalLocked?.total ?? 0),
    expectedReturns,
  };
}

export async function getAnalyticsBundle() {
  const [
    monthlyProfit,
    cashFlow,
    investments,
    expensesByCategory,
    purchased,
    sold,
    roiTrend,
    holdingTime,
    manufacturers,
    kpis,
  ] = await Promise.all([
    getMonthlyProfitChart(),
    getCashFlowChart(),
    getInvestmentsChart(),
    getExpensesByCategoryChart(),
    getAssetsPurchasedChart(),
    getAssetsSoldChart(),
    getRoiTrendChart(),
    getHoldingTimeChart(),
    getManufacturerPerformance(),
    getDashboardKpis(),
  ]);
  return {
    monthlyProfit,
    cashFlow,
    investments,
    expensesByCategory,
    purchased,
    sold,
    roiTrend,
    holdingTime,
    manufacturers,
    kpis,
  };
}
