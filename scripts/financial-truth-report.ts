/**
 * Financial Truth Report — Automotive Capital reconciliation.
 *
 * Every vehicle from DB ledgers. Every dashboard KPI expanded line-by-line.
 * Exit 0 only when Dashboard = Vehicle totals = Reports = Database.
 *
 * Usage: npx tsx scripts/financial-truth-report.ts
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, gte, lte, ne, sql, sum } from 'drizzle-orm';
import { closeCapitalDb, capitalDb } from '../src/capital/db/client';
import {
  acAssetInvestors,
  acAssets,
  acManualProfits,
  acSellerPayments,
  acVehicleCosts,
} from '../src/capital/db/schema';
import { resolveDashboardRange, type DateRange } from '../src/capital/lib/dashboardRange';
import { computeGrossDealProfit } from '../src/capital/lib/dealEconomics';
import { computePortfolioRois } from '../src/capital/lib/roi';
import {
  computeTviFromCosts,
  remainingPurchaseFromSellerPayments,
} from '../src/capital/lib/threeLedgers';
import { getDealershipReportKpis } from '../src/capital/services/analytics';
import {
  listAssetsQuery,
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
  purchasePricePaise: number;
  paymentsTotalPaise: number;
  remainingPaise: number | null;
  costsPaise: number;
  repairsPaise: number;
  transportPaise: number;
  commissionPaise: number;
  refundsPaise: number;
  tviRecomputedPaise: number;
  tviStoredPaise: number;
  salePricePaise: number | null;
  grossRecomputedPaise: number | null;
  grossStoredPaise: number | null;
  myProfitPaise: number | null;
  partnerProfitPaise: number | null;
  netProfitPaise: number | null;
  meStakePaise: number;
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
      amountPaise: acVehicleCosts.amountPaise,
    })
    .from(acVehicleCosts)
    .where(eq(acVehicleCosts.isReversed, false));

  const map = new Map<
    string,
    { costs: { amountPaise: number; costType: string }[]; repairs: number; transport: number; commission: number; refunds: number; total: number }
  >();
  for (const r of rows) {
    let e = map.get(r.assetId);
    if (!e) {
      e = { costs: [], repairs: 0, transport: 0, commission: 0, refunds: 0, total: 0 };
      map.set(r.assetId, e);
    }
    const amt = Math.round(r.amountPaise);
    e.costs.push({ amountPaise: amt, costType: r.costType });
    e.total += amt;
    if (r.costType === 'repair_settlement') e.repairs += amt;
    else if (r.costType === 'transport') e.transport += amt;
    else if (r.costType === 'broker_commission') e.commission += amt;
    if (r.costType === 'refund' || amt < 0) e.refunds += Math.abs(amt);
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

async function loadMeStakes() {
  const rows = await capitalDb
    .select({
      assetId: acAssetInvestors.assetId,
      investedPaise: acAssetInvestors.investedPaise,
    })
    .from(acAssetInvestors)
    .where(eq(acAssetInvestors.slot, 'me'));
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.assetId, Math.round(r.investedPaise));
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

async function buildVehicleTruth(): Promise<VehicleTruth[]> {
  const [assets, costsMap, paymentsMap, stakesMap] = await Promise.all([
    capitalDb.select().from(acAssets),
    loadCostsByAsset(),
    loadPaymentsByAsset(),
    loadMeStakes(),
  ]);
  const { monthStart, monthEnd } = monthBounds();

  return assets.map((a) => {
    const cost = costsMap.get(a.id) ?? {
      costs: [],
      repairs: 0,
      transport: 0,
      commission: 0,
      refunds: 0,
      total: 0,
    };
    const paid = paymentsMap.get(a.id) ?? 0;
    const remaining = remainingPurchaseFromSellerPayments(a.purchasePricePaise, paid);
    const tvi = computeTviFromCosts({
      purchasePricePaise: a.purchasePricePaise,
      costs: cost.costs,
    }).totalVehicleInvestmentPaise;
    const sale = a.actualSalePricePaise;
    const grossRecomputed =
      sale != null ? computeGrossDealProfit(sale, tvi) : null;
    const my = a.mySharePaise;
    const partner = a.operatingPartnerProfitPaise ?? a.partnerSharePaise;
    const meStake = stakesMap.get(a.id) ?? 0;
    const inInventory = isOpenInventoryStatus(a.status);
    const inActiveCapital = inInventory && meStake > 0;
    const inLifetimeProfit =
      a.status !== 'cancelled' && a.mySharePaise != null;
    const inMonthlyProfit =
      inLifetimeProfit &&
      a.saleDate != null &&
      a.saleDate >= monthStart &&
      a.saleDate <= monthEnd;
    // Portfolio My ROI includes lifetime my profit (all non-cancelled with share)
    // and Me stakes on non-cancelled as denominator — flag if contributes to either.
    const inRoiNumerator = inLifetimeProfit;
    const inRoiDenominator = a.status !== 'cancelled' && meStake > 0;
    const inRoi = inRoiNumerator || inRoiDenominator;

    const reasons: string[] = [];
    if (inInventory) reasons.push('open inventory status');
    else reasons.push(`status=${a.status} excluded from inventory`);
    if (inActiveCapital) reasons.push(`Active Capital via Me stake ${inr(meStake)}`);
    else if (inInventory) reasons.push('open but Me stake is 0 — not in Active Capital');
    else reasons.push('not in Active Capital');
    if (inLifetimeProfit) reasons.push(`Lifetime Profit via my_share ${inr(my)}`);
    else reasons.push('no entitled my_share or cancelled');
    if (inMonthlyProfit) reasons.push(`Monthly Profit (sale ${a.saleDate} in current month)`);
    else reasons.push('not in current-month entitled profit');
    if (inRoiNumerator) reasons.push('in My ROI numerator');
    if (inRoiDenominator) reasons.push('in My ROI stake denominator');
    if (!inRoi) reasons.push('not in portfolio ROI');

    const rowDiffs: string[] = [];
    if (a.totalInvestmentPaise !== tvi) {
      rowDiffs.push(`TVI stored ${inr(a.totalInvestmentPaise)} != recomputed ${inr(tvi)}`);
    }
    if (sale != null && a.profitPaise != null && grossRecomputed != null && a.profitPaise !== grossRecomputed) {
      rowDiffs.push(
        `Gross stored ${inr(a.profitPaise)} != sale-TVI ${inr(grossRecomputed)}`,
      );
    }
    if (my != null && partner != null && a.profitPaise != null && my + partner !== a.profitPaise) {
      rowDiffs.push(
        `My+Partner ${inr(my + partner)} != Gross ${inr(a.profitPaise)}`,
      );
    }
    if (a.purchasePricePaise <= 0 && paid > 0) {
      rowDiffs.push(`Purchase price 0 with payments ${inr(paid)}`);
    }
    if (remaining != null && remaining < 0) {
      rowDiffs.push(`Negative Remaining ${remaining}`);
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
      purchasePricePaise: a.purchasePricePaise,
      paymentsTotalPaise: paid,
      remainingPaise: remaining,
      costsPaise: cost.total,
      repairsPaise: cost.repairs,
      transportPaise: cost.transport,
      commissionPaise: cost.commission,
      refundsPaise: cost.refunds,
      tviRecomputedPaise: tvi,
      tviStoredPaise: a.totalInvestmentPaise,
      salePricePaise: sale,
      grossRecomputedPaise: grossRecomputed,
      grossStoredPaise: a.profitPaise,
      myProfitPaise: my,
      partnerProfitPaise: partner,
      netProfitPaise: my,
      meStakePaise: meStake,
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

function addDiff(diffs: Diff[], code: string, expected: number | string, actual: number | string, detail: string) {
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

  // Row-level diffs
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
  const activeSum = activeLines.reduce((s, v) => s + v.meStakePaise, 0);
  const liveActive = await sumMyActiveInvestedCapitalPaise();

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

  // Dashboard Vehicles Sold = mine stake > 0 on sold/settled
  const soldMineLines = vehicles.filter(
    (v) =>
      (v.status === 'sold' || v.status === 'settled') && v.meStakePaise > 0,
  );
  const soldAllLines = vehicles.filter(
    (v) => v.status === 'sold' || v.status === 'settled',
  );

  // ROI inputs (match overview.ts)
  const soldTviSum = soldAllLines.reduce((s, v) => s + v.tviStoredPaise, 0);
  const purchaseVolumeAll = vehicles
    .filter((v) => v.status !== 'cancelled')
    .reduce((s, v) => s + v.purchasePricePaise, 0);
  const myCapitalAll = await sumMyInvestedCapitalPaise();
  const grossLifetime =
    vehicles
      .filter((v) => v.status !== 'cancelled' && v.grossStoredPaise != null)
      .reduce((s, v) => s + (v.grossStoredPaise ?? 0), 0) +
    manualsAll.reduce((s, m) => s + m.amountPaise, 0);
  const portfolioRoi = computePortfolioRois({
    grossBusinessProfitPaise: grossLifetime,
    myProfitPaise: lifetimeTruth,
    totalVehicleCostPaise: soldTviSum > 0 ? soldTviSum : purchaseVolumeAll,
    myCapitalInvestedPaise: myCapitalAll,
  });

  // Live dashboard + reports
  const range: DateRange = resolveDashboardRange('month');
  const bundle = await getOverviewBundle(range);
  const mine = bundle.views.mine;
  const reports = await getDealershipReportKpis();
  const listInStock = await listAssetsQuery({
    page: 1,
    pageSize: 500,
    sort: 'created',
    order: 'desc',
    profitFilter: 'all',
    inventoryTab: 'in_stock',
  });

  // Diffs — Active Capital
  addDiff(diffs, 'ACTIVE_CAPITAL/truth_vs_fn', activeSum, liveActive, 'Line sum Me stakes vs sumMyActiveInvestedCapitalPaise');
  addDiff(
    diffs,
    'ACTIVE_CAPITAL/truth_vs_dashboard',
    activeSum,
    mine.activeCapitalPaise ?? mine.capitalAtRiskPaise ?? -1,
    'Line sum vs Overview Active Capital',
  );
  addDiff(
    diffs,
    'ACTIVE_CAPITAL/truth_vs_reports',
    activeSum,
    reports.activeCapitalPaise,
    'Line sum vs Reports Active Capital',
  );

  // Lifetime Profit
  addDiff(diffs, 'LIFETIME_PROFIT/truth_vs_dashboard', lifetimeTruth, mine.profitPaise, 'Entitled my_share+manuals vs Overview Lifetime Profit');
  addDiff(diffs, 'LIFETIME_PROFIT/truth_vs_reports', lifetimeTruth, reports.profitEarnedPaise, 'Entitled vs Reports profitEarnedPaise');

  // Monthly Profit (Overview period for current month range)
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
  addDiff(diffs, 'IN_STOCK/truth_vs_dashboard', stockCount, mine.activeVehicles, 'Open count vs Overview Vehicles In Stock');
  addDiff(diffs, 'IN_STOCK/truth_vs_reports', stockCount, reports.assetsInStock, 'Open count vs Reports assetsInStock');
  addDiff(diffs, 'IN_STOCK/truth_vs_vehicles_page', stockCount, listInStock.total, 'Open count vs Vehicles page In Stock total');

  // Sold — Dashboard uses mine definition; Reports must match
  addDiff(
    diffs,
    'SOLD/truth_mine_vs_dashboard',
    soldMineLines.length,
    mine.vehiclesSold ?? -1,
    'Mine sold/settled with Me stake>0 vs Overview vehiclesSold',
  );
  addDiff(
    diffs,
    'SOLD/truth_mine_vs_reports',
    soldMineLines.length,
    reports.assetsSold,
    'Mine sold SSOT vs Reports assetsSold (must match Dashboard)',
  );

  // ROI
  addDiff(
    diffs,
    'ROI/truth_vs_dashboard',
    portfolioRoi.myRoiBps,
    mine.roiBps ?? -1,
    `My ROI bps formula profit=${lifetimeTruth} base=${portfolioRoi.capitalBasePaise}`,
  );

  // ── Write vehicles md + csv ──────────────────────────────────────
  const vehicleMd: string[] = [
    `# Financial Truth — Vehicles`,
    ``,
    `Generated: ${new Date().toISOString()}`,
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
    vehicleMd.push(`| Purchase Price | ${inr(v.purchasePricePaise)} |`);
    vehicleMd.push(`| Purchase Payments Total | ${inr(v.paymentsTotalPaise)} |`);
    vehicleMd.push(`| Remaining | ${v.remainingPaise == null ? 'null' : inr(v.remainingPaise)} |`);
    vehicleMd.push(`| Vehicle Costs | ${inr(v.costsPaise)} |`);
    vehicleMd.push(`| Repairs | ${inr(v.repairsPaise)} |`);
    vehicleMd.push(`| Transport | ${inr(v.transportPaise)} |`);
    vehicleMd.push(`| Commission | ${inr(v.commissionPaise)} |`);
    vehicleMd.push(`| Refunds | ${inr(v.refundsPaise)} |`);
    vehicleMd.push(`| TVI (recomputed) | ${inr(v.tviRecomputedPaise)} |`);
    vehicleMd.push(`| TVI (stored) | ${inr(v.tviStoredPaise)} |`);
    vehicleMd.push(`| Sale Price | ${inr(v.salePricePaise)} |`);
    vehicleMd.push(`| Gross Profit (recomputed) | ${inr(v.grossRecomputedPaise)} |`);
    vehicleMd.push(`| Gross Profit (stored) | ${inr(v.grossStoredPaise)} |`);
    vehicleMd.push(`| Net Profit (= My) | ${inr(v.netProfitPaise)} |`);
    vehicleMd.push(`| My Profit | ${inr(v.myProfitPaise)} |`);
    vehicleMd.push(`| Partner Profit | ${inr(v.partnerProfitPaise)} |`);
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
    'purchasePricePaise',
    'paymentsTotalPaise',
    'remainingPaise',
    'costsPaise',
    'repairsPaise',
    'transportPaise',
    'commissionPaise',
    'refundsPaise',
    'tviRecomputedPaise',
    'tviStoredPaise',
    'salePricePaise',
    'grossRecomputedPaise',
    'grossStoredPaise',
    'netProfitPaise',
    'myProfitPaise',
    'partnerProfitPaise',
    'meStakePaise',
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
        v.purchasePricePaise,
        v.paymentsTotalPaise,
        v.remainingPaise,
        v.costsPaise,
        v.repairsPaise,
        v.transportPaise,
        v.commissionPaise,
        v.refundsPaise,
        v.tviRecomputedPaise,
        v.tviStoredPaise,
        v.salePricePaise,
        v.grossRecomputedPaise,
        v.grossStoredPaise,
        v.netProfitPaise,
        v.myProfitPaise,
        v.partnerProfitPaise,
        v.meStakePaise,
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
    `Month window: ${monthStart} → ${monthEnd}`,
    ``,
    `## Active Capital`,
    ``,
    `Formula: Σ Me invested_paise on open inventory`,
    ``,
    `| Vehicle | Me Stake |`,
    `|---|---:|`,
    ...activeLines.map((v) => `| ${v.displayName} | ${inr(v.meStakePaise)} |`),
    `| **Sum** | **${inr(activeSum)}** |`,
    ``,
    `- sumMyActiveInvestedCapitalPaise: ${inr(liveActive)}`,
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
    ...monthlyLines.map((v) => `| ${v.displayName} (sale ${v.salePricePaise != null ? 'set' : ''}) | ${inr(v.myProfitPaise)} |`),
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
    `- Denominator (Me stakes non-cancelled, fallback sold TVI): ${inr(portfolioRoi.capitalBasePaise)}`,
    `- myCapitalAll (sumMyInvestedCapitalPaise): ${inr(myCapitalAll)}`,
    `- sold TVI sum: ${inr(soldTviSum)}`,
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
    `## Vehicles Sold (Dashboard mine SSOT)`,
    ``,
    `Definition: status in (sold, settled) AND Me invested_paise > 0`,
    ``,
    `| Vehicle | Status | Me Stake |`,
    `|---|---|---:|`,
    ...soldMineLines.map((v) => `| ${v.displayName} | ${v.status} | ${inr(v.meStakePaise)} |`),
    `| **Count** | | **${soldMineLines.length}** |`,
    ``,
    `- Overview vehiclesSold: ${mine.vehiclesSold}`,
    `- Reports assetsSold: ${reports.assetsSold}`,
    `- Business sold/settled (all): ${soldAllLines.length}`,
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

  // Latest symlink-style copy at reconciliation root
  writeFileSync(
    join(process.cwd(), 'docs/automotive-capital/reconciliation/LATEST_DIFF.md'),
    diffMd.join('\n'),
  );

  console.log(`\nVehicles: ${vehicles.length}`);
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
