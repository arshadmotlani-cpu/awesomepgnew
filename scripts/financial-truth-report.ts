/**
 * Financial Truth Report — Capital Reset Rebuild (investment math SSOT).
 *
 * Current Investment = Seller Price + Σ Costs − Σ Refunds
 * Active Capital     = Σ current_investment_paise on open inventory (not Me stakes)
 * Budget Remaining   = Expected − Current Investment
 * Gross Profit       = Sale − Current Investment; My/Partner via Self / 50-50
 * Seller Remaining   = Seller Price − payments (sellerPricePaise || purchasePricePaise)
 * Vehicles Sold      = status in sold/settled (not Me-stake filter)
 *
 * Exit 0 only when Dashboard = Vehicle totals = Reports = Database (zero diffs).
 *
 * Usage: npx tsx scripts/financial-truth-report.ts
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { closeCapitalDb, capitalDb } from '../src/capital/db/client';
import {
  acAssets,
  acManualProfits,
  acSellerPayments,
  acVehicleCosts,
} from '../src/capital/db/schema';
import { resolveDashboardRange, type DateRange } from '../src/capital/lib/dashboardRange';
import {
  computeBudgetRemaining,
  computeCurrentInvestment,
  computeGrossDealProfit,
  remainingToSeller,
  splitDealProfit,
  type ProfitMode,
} from '../src/capital/lib/investmentMath';
import { computePortfolioRois } from '../src/capital/lib/roi';
import { getDealershipReportKpis } from '../src/capital/services/analytics';
import {
  listAssetsQuery,
  sumActiveCapitalPaise,
  sumMyActiveInvestedCapitalPaise,
  sumMyInvestedCapitalPaise,
} from '../src/capital/services/assets';
import { countOpenInventory, isOpenInventoryStatus } from '../src/capital/services/inventory';
import { getOverviewBundle } from '../src/capital/services/overview';

type Diff = { code: string; expected: string; actual: string; detail: string };

type VehicleTruth = {
  id: string;
  displayName: string;
  status: string;
  sellerPricePaise: number;
  purchasePricePaise: number;
  expectedTotalInvestmentPaise: number;
  paymentsTotalPaise: number;
  remainingPaise: number | null;
  costsPaise: number;
  repairsPaise: number;
  transportPaise: number;
  commissionPaise: number;
  refundsPaise: number;
  currentInvestmentRecomputedPaise: number;
  currentInvestmentStoredPaise: number;
  totalInvestmentStoredPaise: number;
  budgetRemainingRecomputedPaise: number;
  budgetRemainingStoredPaise: number;
  salePricePaise: number | null;
  profitMode: ProfitMode;
  grossRecomputedPaise: number | null;
  grossStoredPaise: number | null;
  myProfitRecomputedPaise: number | null;
  partnerProfitRecomputedPaise: number | null;
  myProfitPaise: number | null;
  partnerProfitPaise: number | null;
  inventoryStatus: string;
  inActiveCapital: boolean;
  inInventory: boolean;
  inLifetimeProfit: boolean;
  inMonthlyProfit: boolean;
  inRoi: boolean;
  reason: string;
  rowDiffs: string[];
};

function inr(paise: number | null | undefined): string {
  if (paise == null) return '—';
  const n = paise / 100;
  return `₹${n.toLocaleString('en-IN')}`;
}

function yn(v: boolean): string {
  return v ? 'YES' : 'NO';
}

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function loadCostsByAsset() {
  const rows = await capitalDb
    .select({
      assetId: acVehicleCosts.assetId,
      costType: acVehicleCosts.costType,
      entryKind: acVehicleCosts.entryKind,
      amountPaise: acVehicleCosts.amountPaise,
    })
    .from(acVehicleCosts)
    .where(eq(acVehicleCosts.isReversed, false));

  const map = new Map<
    string,
    {
      costs: { amountPaise: number; costType: string; isRefund: boolean }[];
      repairs: number;
      transport: number;
      commission: number;
      refunds: number;
      costsPaise: number;
    }
  >();
  for (const r of rows) {
    let e = map.get(r.assetId);
    if (!e) {
      e = { costs: [], repairs: 0, transport: 0, commission: 0, refunds: 0, costsPaise: 0 };
      map.set(r.assetId, e);
    }
    const amt = Math.round(r.amountPaise);
    const isRefund =
      r.entryKind === 'refund' || r.costType === 'refund' || amt < 0;
    e.costs.push({ amountPaise: amt, costType: r.costType, isRefund });
    if (isRefund) {
      e.refunds += Math.abs(amt);
    } else {
      e.costsPaise += amt;
      if (r.costType === 'repair_settlement') e.repairs += amt;
      else if (r.costType === 'transport') e.transport += amt;
      else if (r.costType === 'broker_commission') e.commission += amt;
    }
  }
  return map;
}

async function loadPaymentsByAsset() {
  const rows = await capitalDb
    .select({
      assetId: acSellerPayments.assetId,
      amountPaise: acSellerPayments.amountPaise,
    })
    .from(acSellerPayments)
    .where(eq(acSellerPayments.isReversed, false));
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.assetId, (map.get(r.assetId) ?? 0) + Math.round(r.amountPaise));
  }
  return map;
}

function monthBounds(now = new Date()): { monthStart: string; monthEnd: string; ym: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  const monthEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
  return { monthStart, monthEnd, ym };
}

async function countFinancialChildren(): Promise<{
  sellerPayments: number;
  vehicleCosts: number;
  manualProfits: number;
}> {
  const [sp, vc, mp] = await Promise.all([
    capitalDb
      .select({ c: sql<number>`count(*)::int` })
      .from(acSellerPayments)
      .then((r) => Number(r[0]?.c ?? 0)),
    capitalDb
      .select({ c: sql<number>`count(*)::int` })
      .from(acVehicleCosts)
      .then((r) => Number(r[0]?.c ?? 0)),
    capitalDb
      .select({ c: sql<number>`count(*)::int` })
      .from(acManualProfits)
      .then((r) => Number(r[0]?.c ?? 0)),
  ]);
  return { sellerPayments: sp, vehicleCosts: vc, manualProfits: mp };
}

async function buildVehicleTruth(): Promise<VehicleTruth[]> {
  const [assets, costsMap, paymentsMap] = await Promise.all([
    capitalDb.select().from(acAssets),
    loadCostsByAsset(),
    loadPaymentsByAsset(),
  ]);
  const { monthStart, monthEnd } = monthBounds();

  return assets.map((a) => {
    const cost = costsMap.get(a.id) ?? {
      costs: [],
      repairs: 0,
      transport: 0,
      commission: 0,
      refunds: 0,
      costsPaise: 0,
    };
    const paid = paymentsMap.get(a.id) ?? 0;
    const sellerPricePaise = Math.max(
      0,
      Math.round(a.sellerPricePaise || a.purchasePricePaise || 0),
    );
    const expectedPaise = Math.max(0, Math.round(a.expectedTotalInvestmentPaise || 0));
    const remaining = remainingToSeller(sellerPricePaise, paid);
    const inv = computeCurrentInvestment({
      sellerPricePaise,
      costs: cost.costs.map((c) => ({
        amountPaise: c.amountPaise,
        isRefund: c.isRefund,
      })),
    });
    const budgetRemaining = computeBudgetRemaining(expectedPaise, inv.currentInvestmentPaise);
    const sale = a.actualSalePricePaise;
    const mode = (a.profitDistributionMode ?? 'SELF') as ProfitMode;
    const grossRecomputed =
      sale != null
        ? computeGrossDealProfit(
            sale,
            inv.currentInvestmentPaise,
            a.totalAdditionalIncomePaise ?? 0,
          )
        : null;
    const split =
      grossRecomputed != null ? splitDealProfit(grossRecomputed, mode) : null;
    const my = a.mySharePaise;
    const partner = a.operatingPartnerProfitPaise ?? a.partnerSharePaise;
    const inInventory = isOpenInventoryStatus(a.status);
    /** Active Capital = Current Investment on every open-inventory vehicle (not Me stakes). */
    const inActiveCapital = inInventory;
    const inLifetimeProfit = a.status !== 'cancelled' && a.mySharePaise != null;
    const inMonthlyProfit =
      inLifetimeProfit &&
      a.saleDate != null &&
      a.saleDate >= monthStart &&
      a.saleDate <= monthEnd;
    const inRoi =
      inLifetimeProfit ||
      (a.status !== 'cancelled' && inv.currentInvestmentPaise > 0);

    const reasons: string[] = [];
    if (inInventory) reasons.push('open inventory status');
    else reasons.push(`status=${a.status} excluded from inventory`);
    if (inActiveCapital) {
      reasons.push(`Active Capital via current investment ${inr(inv.currentInvestmentPaise)}`);
    } else {
      reasons.push('not in Active Capital');
    }
    if (inLifetimeProfit) reasons.push(`Lifetime Profit via my_share ${inr(my)}`);
    else reasons.push('no entitled my_share or cancelled');
    if (inMonthlyProfit) reasons.push(`Monthly Profit (sale ${a.saleDate} in current month)`);
    else reasons.push('not in current-month entitled profit');
    if (inRoi) reasons.push('in portfolio ROI inputs');
    else reasons.push('not in portfolio ROI');

    const rowDiffs: string[] = [];
    if (a.currentInvestmentPaise !== inv.currentInvestmentPaise) {
      rowDiffs.push(
        `Current Investment stored ${inr(a.currentInvestmentPaise)} != recomputed ${inr(inv.currentInvestmentPaise)}`,
      );
    }
    if (a.totalInvestmentPaise !== inv.currentInvestmentPaise) {
      rowDiffs.push(
        `totalInvestmentPaise ${inr(a.totalInvestmentPaise)} != current ${inr(inv.currentInvestmentPaise)}`,
      );
    }
    if (a.budgetRemainingPaise !== budgetRemaining) {
      rowDiffs.push(
        `Budget Remaining stored ${inr(a.budgetRemainingPaise)} != recomputed ${inr(budgetRemaining)}`,
      );
    }
    if (sale != null && a.profitPaise != null && grossRecomputed != null && a.profitPaise !== grossRecomputed) {
      rowDiffs.push(
        `Gross stored ${inr(a.profitPaise)} != sale−current ${inr(grossRecomputed)}`,
      );
    }
    if (split != null && my != null && my !== split.myProfitPaise) {
      rowDiffs.push(
        `My Profit stored ${inr(my)} != ${mode} split ${inr(split.myProfitPaise)}`,
      );
    }
    if (split != null && partner != null && partner !== split.partnerProfitPaise) {
      rowDiffs.push(
        `Partner Profit stored ${inr(partner)} != ${mode} split ${inr(split.partnerProfitPaise)}`,
      );
    }
    if (my != null && partner != null && a.profitPaise != null && my + partner !== a.profitPaise) {
      rowDiffs.push(`My+Partner ${inr(my + partner)} != Gross ${inr(a.profitPaise)}`);
    }
    if (sellerPricePaise <= 0 && paid > 0) {
      rowDiffs.push(`Seller price 0 with payments ${inr(paid)}`);
    }
    if (remaining != null && remaining < 0) {
      rowDiffs.push(`Negative Seller Remaining ${remaining}`);
    }

    let inventoryStatus = 'open';
    if (a.status === 'sold') inventoryStatus = 'sold';
    else if (a.status === 'settled') inventoryStatus = 'settled';
    else if (a.status === 'cancelled') inventoryStatus = 'archived';
    else inventoryStatus = `open:${a.status}`;

    return {
      id: a.id,
      displayName: a.displayName,
      status: a.status,
      sellerPricePaise,
      purchasePricePaise: a.purchasePricePaise,
      expectedTotalInvestmentPaise: expectedPaise,
      paymentsTotalPaise: paid,
      remainingPaise: remaining,
      costsPaise: inv.costsPaise,
      repairsPaise: cost.repairs,
      transportPaise: cost.transport,
      commissionPaise: cost.commission,
      refundsPaise: inv.refundsPaise,
      currentInvestmentRecomputedPaise: inv.currentInvestmentPaise,
      currentInvestmentStoredPaise: a.currentInvestmentPaise,
      totalInvestmentStoredPaise: a.totalInvestmentPaise,
      budgetRemainingRecomputedPaise: budgetRemaining,
      budgetRemainingStoredPaise: a.budgetRemainingPaise,
      salePricePaise: sale,
      profitMode: mode,
      grossRecomputedPaise: grossRecomputed,
      grossStoredPaise: a.profitPaise,
      myProfitRecomputedPaise: split?.myProfitPaise ?? null,
      partnerProfitRecomputedPaise: split?.partnerProfitPaise ?? null,
      myProfitPaise: my,
      partnerProfitPaise: partner,
      inventoryStatus,
      inActiveCapital,
      inInventory,
      inLifetimeProfit,
      inMonthlyProfit,
      inRoi,
      reason: reasons.join('; '),
      rowDiffs,
    };
  });
}

function addDiff(
  diffs: Diff[],
  code: string,
  expected: number | string,
  actual: number | string,
  detail: string,
) {
  const e = typeof expected === 'number' ? String(expected) : expected;
  const a = typeof actual === 'number' ? String(actual) : actual;
  if (e === a) return;
  diffs.push({ code, expected: e, actual: a, detail });
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = join(
    process.cwd(),
    'docs/automotive-capital/reconciliation',
    stamp,
  );
  mkdirSync(outDir, { recursive: true });

  console.log(`Financial Truth Report → ${outDir}`);

  const vehicles = await buildVehicleTruth();
  const diffs: Diff[] = [];

  for (const v of vehicles) {
    for (const d of v.rowDiffs) {
      diffs.push({
        code: `VEHICLE/${v.id}`,
        expected: 'ledger-consistent',
        actual: 'mismatch',
        detail: `${v.displayName}: ${d}`,
      });
    }
  }

  // ── KPI expansions ──────────────────────────────────────────────
  const activeLines = vehicles.filter((v) => v.inActiveCapital);
  const activeSumStored = activeLines.reduce((s, v) => s + v.currentInvestmentStoredPaise, 0);
  const activeSumRecomputed = activeLines.reduce(
    (s, v) => s + v.currentInvestmentRecomputedPaise,
    0,
  );
  const liveActive = await sumActiveCapitalPaise();
  const liveActiveAlias = await sumMyActiveInvestedCapitalPaise();

  const lifetimeLines = vehicles.filter((v) => v.inLifetimeProfit);
  const lifetimeVehicleSum = lifetimeLines.reduce((s, v) => s + (v.myProfitPaise ?? 0), 0);
  const manualsAll = await capitalDb
    .select()
    .from(acManualProfits)
    .where(eq(acManualProfits.isReversed, false));
  const manualLifetimeSum = manualsAll.reduce((s, m) => s + m.mySharePaise, 0);
  const lifetimeTruth = lifetimeVehicleSum + manualLifetimeSum;

  const { monthStart, monthEnd, ym } = monthBounds();
  const monthlyLines = vehicles.filter((v) => v.inMonthlyProfit);
  const monthlyVehicleSum = monthlyLines.reduce((s, v) => s + (v.myProfitPaise ?? 0), 0);
  const manualsMonth = manualsAll.filter(
    (m) => m.profitDate >= monthStart && m.profitDate <= monthEnd,
  );
  const monthlyManualSum = manualsMonth.reduce((s, m) => s + m.mySharePaise, 0);
  const monthlyTruth = monthlyVehicleSum + monthlyManualSum;

  const stockLines = vehicles.filter((v) => v.inInventory);
  const stockCount = stockLines.length;
  const liveStock = await countOpenInventory();

  /** Vehicles Sold = status in sold/settled (no Me-stake filter). */
  const soldLines = vehicles.filter((v) => v.status === 'sold' || v.status === 'settled');

  const soldCurrentInvestmentSum = soldLines.reduce(
    (s, v) => s + v.currentInvestmentStoredPaise,
    0,
  );
  const purchaseVolumeAll = vehicles
    .filter((v) => v.status !== 'cancelled')
    .reduce((s, v) => s + v.sellerPricePaise, 0);
  const myCapitalAll = await sumMyInvestedCapitalPaise();
  const grossLifetime =
    vehicles
      .filter((v) => v.status !== 'cancelled' && v.grossStoredPaise != null)
      .reduce((s, v) => s + (v.grossStoredPaise ?? 0), 0) +
    manualsAll.reduce((s, m) => s + m.amountPaise, 0);
  const portfolioRoi = computePortfolioRois({
    grossBusinessProfitPaise: grossLifetime,
    myProfitPaise: lifetimeTruth,
    totalVehicleCostPaise:
      soldCurrentInvestmentSum > 0 ? soldCurrentInvestmentSum : purchaseVolumeAll,
    myCapitalInvestedPaise: myCapitalAll,
  });

  const childCounts = await countFinancialChildren();
  const postResetClean =
    soldLines.length === 0 &&
    vehicles.every(
      (v) =>
        v.sellerPricePaise === 0 &&
        v.currentInvestmentStoredPaise === 0 &&
        v.salePricePaise == null,
    );

  // Live dashboard + reports
  const range: DateRange = resolveDashboardRange('month');
  const bundle = await getOverviewBundle(range);
  const mine = bundle.views.mine;
  const business = bundle.views.business;
  const reports = await getDealershipReportKpis();
  const listInStock = await listAssetsQuery({
    page: 1,
    pageSize: 500,
    sort: 'created',
    order: 'desc',
    profitFilter: 'all',
    inventoryTab: 'in_stock',
  });

  // Diffs — Active Capital (Σ current investment on open inventory)
  addDiff(
    diffs,
    'ACTIVE_CAPITAL/truth_stored_vs_recomputed',
    activeSumStored,
    activeSumRecomputed,
    'Open-inventory stored currentInvestment vs recomputed',
  );
  addDiff(
    diffs,
    'ACTIVE_CAPITAL/truth_vs_fn',
    activeSumStored,
    liveActive,
    'Line sum currentInvestment vs sumActiveCapitalPaise',
  );
  addDiff(
    diffs,
    'ACTIVE_CAPITAL/alias_fn',
    liveActive,
    liveActiveAlias,
    'sumActiveCapitalPaise vs sumMyActiveInvestedCapitalPaise alias',
  );
  addDiff(
    diffs,
    'ACTIVE_CAPITAL/truth_vs_dashboard',
    activeSumStored,
    mine.activeCapitalPaise ?? mine.capitalAtRiskPaise ?? -1,
    'Line sum vs Overview Active Capital (current investment)',
  );
  addDiff(
    diffs,
    'ACTIVE_CAPITAL/truth_vs_reports',
    activeSumStored,
    reports.activeCapitalPaise,
    'Line sum vs Reports Active Capital',
  );

  // Lifetime Profit
  addDiff(
    diffs,
    'LIFETIME_PROFIT/truth_vs_dashboard',
    lifetimeTruth,
    mine.profitPaise,
    'Entitled my_share+manuals vs Overview Lifetime Profit',
  );
  addDiff(
    diffs,
    'LIFETIME_PROFIT/truth_vs_reports',
    lifetimeTruth,
    reports.profitEarnedPaise,
    'Entitled vs Reports profitEarnedPaise',
  );

  // Monthly Profit
  addDiff(
    diffs,
    'MONTHLY_PROFIT/truth_vs_dashboard',
    monthlyTruth,
    mine.periodProfitPaise ?? -1,
    `Current month ${ym} entitled vs Overview periodProfitPaise`,
  );
  addDiff(
    diffs,
    'MONTHLY_PROFIT/truth_vs_reports',
    monthlyTruth,
    reports.monthlyProfitPaise,
    `Current month ${ym} entitled vs Reports monthlyProfitPaise`,
  );

  // Stock
  addDiff(diffs, 'IN_STOCK/truth_vs_fn', stockCount, liveStock, 'Open vehicle count vs countOpenInventory');
  addDiff(
    diffs,
    'IN_STOCK/truth_vs_dashboard',
    stockCount,
    mine.activeVehicles,
    'Open count vs Overview Vehicles In Stock',
  );
  addDiff(
    diffs,
    'IN_STOCK/truth_vs_reports',
    stockCount,
    reports.assetsInStock,
    'Open count vs Reports assetsInStock',
  );
  addDiff(
    diffs,
    'IN_STOCK/truth_vs_vehicles_page',
    stockCount,
    listInStock.total,
    'Open count vs Vehicles page In Stock total',
  );

  // Sold — status sold/settled only (not Me stake)
  addDiff(
    diffs,
    'SOLD/truth_vs_dashboard',
    soldLines.length,
    bundle.shared.vehiclesSold ?? business.vehiclesSold ?? -1,
    'sold/settled count vs Overview shared/business vehiclesSold',
  );
  addDiff(
    diffs,
    'SOLD/truth_vs_reports',
    soldLines.length,
    reports.assetsSold,
    'sold/settled count vs Reports assetsSold',
  );

  // ROI
  addDiff(
    diffs,
    'ROI/truth_vs_dashboard',
    portfolioRoi.myRoiBps,
    mine.roiBps ?? -1,
    `My ROI bps formula profit=${lifetimeTruth} base=${portfolioRoi.capitalBasePaise}`,
  );

  // Legacy funding / outstanding must not appear on dashboard KPIs
  addDiff(
    diffs,
    'LEGACY/reports_outstanding',
    0,
    reports.capitalOutstandingPaise,
    'Reports capitalOutstandingPaise must stay 0 (no legacy outstanding KPI)',
  );

  // Post-reset: kept vehicles = open inventory; financial children empty until re-entry
  if (postResetClean) {
    addDiff(
      diffs,
      'RESET/kept_equals_open',
      vehicles.length,
      stockCount,
      'After reset: all kept vehicles must be open inventory',
    );
    addDiff(
      diffs,
      'RESET/seller_payments_empty',
      0,
      childCounts.sellerPayments,
      'After reset: ac_seller_payments empty until user re-enters',
    );
    addDiff(
      diffs,
      'RESET/vehicle_costs_empty',
      0,
      childCounts.vehicleCosts,
      'After reset: ac_vehicle_costs empty until user re-enters',
    );
    addDiff(
      diffs,
      'RESET/manual_profits_empty',
      0,
      childCounts.manualProfits,
      'After reset: ac_manual_profits empty until user re-enters',
    );
    const [legacySums] = await capitalDb
      .select({
        funding: sql<number>`COALESCE(SUM(${acAssets.fundingGapPaise}), 0)`,
        outstanding: sql<number>`COALESCE(SUM(${acAssets.outstandingPaise}), 0)`,
      })
      .from(acAssets);
    addDiff(
      diffs,
      'RESET/funding_gap_zero',
      0,
      Number(legacySums?.funding ?? 0),
      'After reset: fundingGapPaise must be 0 on kept vehicles',
    );
    addDiff(
      diffs,
      'RESET/outstanding_zero',
      0,
      Number(legacySums?.outstanding ?? 0),
      'After reset: outstandingPaise must be 0 on kept vehicles',
    );
  }

  // ── Write vehicles md + csv ──────────────────────────────────────
  const vehicleMd: string[] = [
    `# Financial Truth — Vehicles`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `SSOT: Capital Reset Rebuild investment math`,
    `Vehicles: ${vehicles.length}`,
    ``,
  ];
  for (const v of vehicles.sort((a, b) => a.displayName.localeCompare(b.displayName))) {
    vehicleMd.push(`## ${v.displayName}`);
    vehicleMd.push(``);
    vehicleMd.push(`| Field | Value |`);
    vehicleMd.push(`|---|---|`);
    vehicleMd.push(`| Id | \`${v.id}\` |`);
    vehicleMd.push(`| Status | ${v.status} |`);
    vehicleMd.push(`| Seller Price | ${inr(v.sellerPricePaise)} |`);
    vehicleMd.push(`| Expected Total Investment | ${inr(v.expectedTotalInvestmentPaise)} |`);
    vehicleMd.push(`| Seller Payments Total | ${inr(v.paymentsTotalPaise)} |`);
    vehicleMd.push(`| Seller Remaining | ${v.remainingPaise == null ? 'null' : inr(v.remainingPaise)} |`);
    vehicleMd.push(`| Costs | ${inr(v.costsPaise)} |`);
    vehicleMd.push(`| Repairs | ${inr(v.repairsPaise)} |`);
    vehicleMd.push(`| Transport | ${inr(v.transportPaise)} |`);
    vehicleMd.push(`| Commission | ${inr(v.commissionPaise)} |`);
    vehicleMd.push(`| Refunds | ${inr(v.refundsPaise)} |`);
    vehicleMd.push(`| Current Investment (recomputed) | ${inr(v.currentInvestmentRecomputedPaise)} |`);
    vehicleMd.push(`| Current Investment (stored) | ${inr(v.currentInvestmentStoredPaise)} |`);
    vehicleMd.push(`| totalInvestmentPaise (alias) | ${inr(v.totalInvestmentStoredPaise)} |`);
    vehicleMd.push(`| Budget Remaining (recomputed) | ${inr(v.budgetRemainingRecomputedPaise)} |`);
    vehicleMd.push(`| Budget Remaining (stored) | ${inr(v.budgetRemainingStoredPaise)} |`);
    vehicleMd.push(`| Sale Price | ${inr(v.salePricePaise)} |`);
    vehicleMd.push(`| Profit Mode | ${v.profitMode} |`);
    vehicleMd.push(`| Gross Profit (recomputed) | ${inr(v.grossRecomputedPaise)} |`);
    vehicleMd.push(`| Gross Profit (stored) | ${inr(v.grossStoredPaise)} |`);
    vehicleMd.push(`| My Profit (recomputed) | ${inr(v.myProfitRecomputedPaise)} |`);
    vehicleMd.push(`| My Profit (stored) | ${inr(v.myProfitPaise)} |`);
    vehicleMd.push(`| Partner Profit (recomputed) | ${inr(v.partnerProfitRecomputedPaise)} |`);
    vehicleMd.push(`| Partner Profit (stored) | ${inr(v.partnerProfitPaise)} |`);
    vehicleMd.push(`| Inventory Status | ${v.inventoryStatus} |`);
    vehicleMd.push(`| Included in Active Capital? | ${yn(v.inActiveCapital)} |`);
    vehicleMd.push(`| Included in Inventory? | ${yn(v.inInventory)} |`);
    vehicleMd.push(`| Included in Lifetime Profit? | ${yn(v.inLifetimeProfit)} |`);
    vehicleMd.push(`| Included in Monthly Profit? | ${yn(v.inMonthlyProfit)} |`);
    vehicleMd.push(`| Included in ROI? | ${yn(v.inRoi)} |`);
    vehicleMd.push(`| Reason | ${v.reason} |`);
    if (v.rowDiffs.length) {
      vehicleMd.push(`| Row diffs | ${v.rowDiffs.join('; ')} |`);
    }
    vehicleMd.push(``);
  }
  writeFileSync(join(outDir, 'financial-truth-vehicles.md'), vehicleMd.join('\n'));

  const csvHeader = [
    'id',
    'displayName',
    'status',
    'sellerPricePaise',
    'expectedTotalInvestmentPaise',
    'paymentsTotalPaise',
    'remainingPaise',
    'costsPaise',
    'repairsPaise',
    'transportPaise',
    'commissionPaise',
    'refundsPaise',
    'currentInvestmentRecomputedPaise',
    'currentInvestmentStoredPaise',
    'totalInvestmentStoredPaise',
    'budgetRemainingRecomputedPaise',
    'budgetRemainingStoredPaise',
    'salePricePaise',
    'profitMode',
    'grossRecomputedPaise',
    'grossStoredPaise',
    'myProfitRecomputedPaise',
    'myProfitPaise',
    'partnerProfitRecomputedPaise',
    'partnerProfitPaise',
    'inventoryStatus',
    'inActiveCapital',
    'inInventory',
    'inLifetimeProfit',
    'inMonthlyProfit',
    'inRoi',
    'reason',
    'rowDiffs',
  ];
  const csvRows = [
    csvHeader.join(','),
    ...vehicles.map((v) =>
      [
        v.id,
        v.displayName,
        v.status,
        v.sellerPricePaise,
        v.expectedTotalInvestmentPaise,
        v.paymentsTotalPaise,
        v.remainingPaise,
        v.costsPaise,
        v.repairsPaise,
        v.transportPaise,
        v.commissionPaise,
        v.refundsPaise,
        v.currentInvestmentRecomputedPaise,
        v.currentInvestmentStoredPaise,
        v.totalInvestmentStoredPaise,
        v.budgetRemainingRecomputedPaise,
        v.budgetRemainingStoredPaise,
        v.salePricePaise,
        v.profitMode,
        v.grossRecomputedPaise,
        v.grossStoredPaise,
        v.myProfitRecomputedPaise,
        v.myProfitPaise,
        v.partnerProfitRecomputedPaise,
        v.partnerProfitPaise,
        v.inventoryStatus,
        v.inActiveCapital,
        v.inInventory,
        v.inLifetimeProfit,
        v.inMonthlyProfit,
        v.inRoi,
        v.reason,
        v.rowDiffs.join('; '),
      ]
        .map(csvEscape)
        .join(','),
    ),
  ];
  writeFileSync(join(outDir, 'financial-truth-vehicles.csv'), csvRows.join('\n'));

  // ── KPI markdown ────────────────────────────────────────────────
  const kpiMd: string[] = [
    `# Financial Truth — KPI Reconciliation`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `SSOT: Capital Reset Rebuild investment math`,
    `Month window: ${monthStart} → ${monthEnd}`,
    `Post-reset clean portfolio: ${yn(postResetClean)}`,
    ``,
    `## Active Capital`,
    ``,
    `Formula: Σ current_investment_paise on open inventory (not Me stakes)`,
    ``,
    `| Vehicle | Current Investment (stored) | Current Investment (recomputed) |`,
    `|---|---:|---:|`,
    ...activeLines.map(
      (v) =>
        `| ${v.displayName} | ${inr(v.currentInvestmentStoredPaise)} | ${inr(v.currentInvestmentRecomputedPaise)} |`,
    ),
    `| **Sum** | **${inr(activeSumStored)}** | **${inr(activeSumRecomputed)}** |`,
    ``,
    `- sumActiveCapitalPaise: ${inr(liveActive)}`,
    `- sumMyActiveInvestedCapitalPaise (alias): ${inr(liveActiveAlias)}`,
    `- Overview Active Capital: ${inr(mine.activeCapitalPaise ?? mine.capitalAtRiskPaise)}`,
    `- Reports activeCapitalPaise: ${inr(reports.activeCapitalPaise)}`,
    ``,
    `## Lifetime Profit (entitled)`,
    ``,
    `Formula: Σ my_share_paise (status ≠ cancelled, share not null) + Σ manual my_share`,
    ``,
    `| Vehicle | My Profit |`,
    `|---|---:|`,
    ...lifetimeLines.map((v) => `| ${v.displayName} | ${inr(v.myProfitPaise)} |`),
    ...manualsAll.map(
      (m) => `| manual:${m.description.slice(0, 40)} (${m.profitDate}) | ${inr(m.mySharePaise)} |`,
    ),
    `| **Sum** | **${inr(lifetimeTruth)}** |`,
    ``,
    `- Overview Lifetime Profit: ${inr(mine.profitPaise)}`,
    `- Reports profitEarnedPaise: ${inr(reports.profitEarnedPaise)}`,
    ``,
    `## Monthly Profit (${ym})`,
    ``,
    `| Vehicle / Manual | My Profit |`,
    `|---|---:|`,
    ...monthlyLines.map((v) => `| ${v.displayName} | ${inr(v.myProfitPaise)} |`),
    ...manualsMonth.map(
      (m) => `| manual:${m.description.slice(0, 40)} (${m.profitDate}) | ${inr(m.mySharePaise)} |`,
    ),
    `| **Sum** | **${inr(monthlyTruth)}** |`,
    ``,
    `- Overview periodProfitPaise: ${inr(mine.periodProfitPaise)}`,
    `- Reports monthlyProfitPaise: ${inr(reports.monthlyProfitPaise)}`,
    ``,
    `## ROI (My portfolio)`,
    ``,
    `- Numerator (My Lifetime Profit): ${inr(lifetimeTruth)}`,
    `- Denominator base: ${inr(portfolioRoi.capitalBasePaise)}`,
    `- myCapitalAll (sumMyInvestedCapitalPaise): ${inr(myCapitalAll)}`,
    `- sold Current Investment sum: ${inr(soldCurrentInvestmentSum)}`,
    `- Computed myRoiBps: ${portfolioRoi.myRoiBps} (${(portfolioRoi.myRoiBps / 100).toFixed(1)}%)`,
    `- Overview roiBps: ${mine.roiBps}`,
    ``,
    `## Vehicles in Stock`,
    ``,
    `| Vehicle | Status |`,
    `|---|---|`,
    ...stockLines.map((v) => `| ${v.displayName} | ${v.status} |`),
    `| **Count** | **${stockCount}** |`,
    ``,
    `- countOpenInventory: ${liveStock}`,
    `- Overview activeVehicles: ${mine.activeVehicles}`,
    `- Reports assetsInStock: ${reports.assetsInStock}`,
    `- Vehicles page total: ${listInStock.total}`,
    ``,
    `## Vehicles Sold`,
    ``,
    `Definition: status in (sold, settled) — not Me-stake filtered`,
    ``,
    `| Vehicle | Status | Current Investment |`,
    `|---|---|---:|`,
    ...soldLines.map(
      (v) => `| ${v.displayName} | ${v.status} | ${inr(v.currentInvestmentStoredPaise)} |`,
    ),
    `| **Count** | | **${soldLines.length}** |`,
    ``,
    `- Overview shared.vehiclesSold: ${bundle.shared.vehiclesSold}`,
    `- Overview business.vehiclesSold: ${business.vehiclesSold}`,
    `- Overview mine.vehiclesSold (legacy field): ${mine.vehiclesSold}`,
    `- Reports assetsSold: ${reports.assetsSold}`,
    ``,
    `## Legacy KPIs (must stay zero)`,
    ``,
    `- Reports capitalOutstandingPaise: ${inr(reports.capitalOutstandingPaise)}`,
    ``,
    `## Financial child tables`,
    ``,
    `- ac_seller_payments: ${childCounts.sellerPayments}`,
    `- ac_vehicle_costs: ${childCounts.vehicleCosts}`,
    `- ac_manual_profits: ${childCounts.manualProfits}`,
    ``,
  ];
  writeFileSync(join(outDir, 'financial-truth-kpis.md'), kpiMd.join('\n'));

  // ── Diffs ───────────────────────────────────────────────────────
  const diffMd: string[] = [
    `# Financial Truth — Diffs`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Mismatch count: ${diffs.length}`,
    ``,
  ];
  if (diffs.length === 0) {
    diffMd.push(`All figures match exactly.`);
  } else {
    diffMd.push(`| Code | Expected | Actual | Detail |`);
    diffMd.push(`|---|---|---|---|`);
    for (const d of diffs) {
      diffMd.push(`| ${d.code} | ${d.expected} | ${d.actual} | ${d.detail.replace(/\|/g, '/')} |`);
    }
  }
  writeFileSync(join(outDir, 'financial-truth-diff.md'), diffMd.join('\n'));

  writeFileSync(
    join(process.cwd(), 'docs/automotive-capital/reconciliation/LATEST_DIFF.md'),
    diffMd.join('\n'),
  );

  console.log(`\nVehicles: ${vehicles.length}`);
  console.log(`Active Capital (stored/recomputed): ${activeSumStored} / ${activeSumRecomputed}`);
  console.log(`Diffs: ${diffs.length}`);
  for (const d of diffs.slice(0, 40)) {
    console.log(`  FAIL ${d.code}: expected=${d.expected} actual=${d.actual} — ${d.detail}`);
  }
  if (diffs.length > 40) console.log(`  … ${diffs.length - 40} more`);

  await closeCapitalDb();
  process.exit(diffs.length === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await closeCapitalDb();
  process.exit(1);
});
