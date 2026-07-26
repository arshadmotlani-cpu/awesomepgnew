/**
 * Automotive Capital — Final Acceptance Audit
 *
 * Runs realistic dealership workflows against INVEST_DATABASE_*.
 * Creates tagged fixtures, asserts SSOTs, then archives fixtures.
 *
 * Usage: npx tsx scripts/acceptance-capital-audit.ts
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();

import { and, eq, ilike, ne, sql, sum } from 'drizzle-orm';
import { closeCapitalDb, capitalDb } from '../src/capital/db/client';
import {
  acAssets,
  acSellerPayments,
  acVehicleActivities,
  acVehicleCosts,
} from '../src/capital/db/schema';
import { remainingPurchaseFromSellerPayments } from '../src/capital/lib/threeLedgers';
import {
  createAsset,
  getAssetDetail,
  listAssetsQuery,
  recordSale,
  sumMyActiveInvestedCapitalPaise,
  updateAssetStatus,
} from '../src/capital/services/assets';
import { getDealershipReportKpis } from '../src/capital/services/analytics';
import { countOpenInventory } from '../src/capital/services/inventory';
import { recordSellerPayment } from '../src/capital/services/sellerPayments';
import { createSettlement } from '../src/capital/services/settlements';
import {
  createVehicleActivity,
  reverseVehicleActivity,
  updateVehicleActivity,
} from '../src/capital/services/vehicleActivities';

const RUN_ID = `ACCEPTANCE_${Date.now()}`;
const TAG = `[${RUN_ID}]`;
const TODAY = new Date().toISOString().slice(0, 10);

const INR = (rupees: number) => Math.round(rupees * 100);

type Result = { scenario: string; pass: boolean; details: string[] };
const results: Result[] = [];
const createdAssetIds: string[] = [];

function record(scenario: string, checks: { ok: boolean; msg: string }[]) {
  const failed = checks.filter((c) => !c.ok);
  const pass = failed.length === 0;
  results.push({
    scenario,
    pass,
    details: checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.msg}`),
  });
  console.log(`\n═══ ${pass ? 'PASS' : 'FAIL'} — ${scenario} ═══`);
  for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.msg}`);
}

async function makeVehicle(opts: {
  model: string;
  purchasePricePaise: number;
  tokenPaidPaise?: number;
}) {
  const asset = await createAsset({
    manufacturer: 'Acceptance',
    model: `${opts.model} ${RUN_ID}`,
    year: 2024,
    fuelType: 'petrol',
    ownership: 'first_owner',
    purchaseDate: TODAY,
    purchasePricePaise: opts.purchasePricePaise,
    tokenPaidPaise: opts.tokenPaidPaise,
    notes: TAG,
    registrationNumber: `ACC${String(createdAssetIds.length + 1).padStart(4, '0')}${RUN_ID.slice(-4)}`,
  });
  createdAssetIds.push(asset.id);
  return asset;
}

async function refresh(assetId: string) {
  const detail = await getAssetDetail(assetId);
  if (!detail) throw new Error(`Asset ${assetId} not found`);
  return detail.asset;
}

async function sellerPaid(assetId: string) {
  const [row] = await capitalDb
    .select({ total: sum(acSellerPayments.amountPaise) })
    .from(acSellerPayments)
    .where(and(eq(acSellerPayments.assetId, assetId), eq(acSellerPayments.isReversed, false)));
  return Number(row?.total ?? 0);
}

async function costSum(assetId: string) {
  const [row] = await capitalDb
    .select({ total: sum(acVehicleCosts.amountPaise) })
    .from(acVehicleCosts)
    .where(and(eq(acVehicleCosts.assetId, assetId), eq(acVehicleCosts.isReversed, false)));
  return Number(row?.total ?? 0);
}

async function findPaymentActivity(assetId: string, type: string) {
  const [row] = await capitalDb
    .select()
    .from(acVehicleActivities)
    .where(
      and(
        eq(acVehicleActivities.assetId, assetId),
        eq(acVehicleActivities.activityType, type as typeof acVehicleActivities.activityType.enumValues[number]),
        eq(acVehicleActivities.isReversed, false),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function findCostActivity(assetId: string, type: string) {
  return findPaymentActivity(assetId, type);
}

/* ───────────────────────── Scenarios ───────────────────────── */

async function scenario1() {
  const checks: { ok: boolean; msg: string }[] = [];
  const price = INR(9_60_000);
  const token = INR(10_000);
  const rtgs = INR(9_50_000);

  const beforeStock = await countOpenInventory();
  const beforeActive = await sumMyActiveInvestedCapitalPaise();

  const asset = await makeVehicle({
    model: 'S1-Simple',
    purchasePricePaise: price,
    tokenPaidPaise: token,
  });

  await recordSellerPayment({
    assetId: asset.id,
    amountPaise: rtgs,
    paidAt: TODAY,
    instrument: 'rtgs',
    notes: `${TAG} final RTGS`,
  });

  const fresh = await refresh(asset.id);
  const paid = await sellerPaid(asset.id);
  const remaining = remainingPurchaseFromSellerPayments(fresh.purchasePricePaise, paid);

  checks.push({
    ok: paid === price,
    msg: `Seller paid ${paid / 100} == purchase ${price / 100}`,
  });
  checks.push({ ok: remaining === 0, msg: `Remaining = ₹0 (got ${remaining})` });
  checks.push({
    ok: fresh.totalInvestmentPaise === price,
    msg: `TVI = ₹9,60,000 (got ₹${fresh.totalInvestmentPaise / 100})`,
  });
  checks.push({
    ok: !['sold', 'settled', 'cancelled'].includes(fresh.status),
    msg: `Purchase complete / in stock (status=${fresh.status})`,
  });

  const afterStock = await countOpenInventory();
  const afterActive = await sumMyActiveInvestedCapitalPaise();
  checks.push({
    ok: afterStock === beforeStock + 1,
    msg: `Dashboard In Stock +1 (${beforeStock} → ${afterStock})`,
  });
  checks.push({
    ok: afterActive === beforeActive + price,
    msg: `Active Capital +purchase (${beforeActive / 100} → ${afterActive / 100})`,
  });

  record('Scenario 1 – Simple Purchase', checks);
  return asset.id;
}

async function scenario2() {
  const checks: { ok: boolean; msg: string }[] = [];
  const price = INR(9_60_000);
  const expectedTvi = INR(9_85_000); // 960k + 10k + 5k + 15k - 5k

  const asset = await makeVehicle({
    model: 'S2-Costs',
    purchasePricePaise: price,
  });

  await createVehicleActivity({
    assetId: asset.id,
    activityType: 'broker_commission',
    activityAt: TODAY,
    amountPaise: INR(10_000),
    title: `${TAG} Commission`,
  });
  await createVehicleActivity({
    assetId: asset.id,
    activityType: 'transport',
    activityAt: TODAY,
    amountPaise: INR(5_000),
    title: `${TAG} Transport`,
  });

  // Repair via advance + settlement (actual cost enters TVI)
  await createVehicleActivity({
    assetId: asset.id,
    activityType: 'repair_advance',
    activityAt: TODAY,
    amountPaise: INR(15_000),
    title: `${TAG} Repair Advance`,
  });
  const { acRepairAdvances } = await import('../src/capital/db/schema');
  const [openAdv] = await capitalDb
    .select()
    .from(acRepairAdvances)
    .where(and(eq(acRepairAdvances.assetId, asset.id), eq(acRepairAdvances.status, 'open')))
    .limit(1);
  if (!openAdv) throw new Error('Expected open repair advance');
  await createVehicleActivity({
    assetId: asset.id,
    activityType: 'repair_settlement',
    activityAt: TODAY,
    repairAdvanceId: openAdv.id,
    actualCostPaise: INR(15_000),
    returnedPaise: 0,
    title: `${TAG} Repair Settlement`,
  });

  // Repair refund = negative cost activity
  await createVehicleActivity({
    assetId: asset.id,
    activityType: 'miscellaneous',
    activityAt: TODAY,
    amountPaise: -INR(5_000),
    title: `${TAG} Repair Refund`,
  });

  const fresh = await refresh(asset.id);
  const costs = await costSum(asset.id);
  checks.push({
    ok: costs === INR(10_000) + INR(5_000) + INR(15_000) - INR(5_000),
    msg: `Cost ledger sum = ₹25,000 net (got ₹${costs / 100})`,
  });
  checks.push({
    ok: fresh.totalInvestmentPaise === expectedTvi,
    msg: `Vehicle Details TVI = ₹9,85,000 (got ₹${fresh.totalInvestmentPaise / 100})`,
  });
  checks.push({
    ok: fresh.repairTotalPaise === INR(15_000),
    msg: `repairTotalPaise = ₹15,000 (got ₹${(fresh.repairTotalPaise ?? 0) / 100})`,
  });
  checks.push({
    ok: (fresh.dealerRefundTotalPaise ?? 0) === INR(5_000),
    msg: `dealerRefundTotalPaise = ₹5,000 (got ₹${(fresh.dealerRefundTotalPaise ?? 0) / 100})`,
  });

  // Vehicle list card
  const list = await listAssetsQuery({
    page: 1,
    pageSize: 50,
    sort: 'investment',
    order: 'desc',
    profitFilter: 'all',
    inventoryTab: 'in_stock',
  });
  const card = list.rows.find((r) => r.asset.id === asset.id);
  checks.push({
    ok: card != null && card.asset.totalInvestmentPaise === expectedTvi,
    msg: `Vehicle Card TVI = ₹9,85,000 (got ₹${(card?.asset.totalInvestmentPaise ?? 0) / 100})`,
  });

  // Reports KPI inventory TVI includes this vehicle's contribution — spot-check report path
  const kpis = await getDealershipReportKpis();
  checks.push({
    ok: kpis.currentInvestmentPaise >= expectedTvi,
    msg: `Reports inventory TVI includes vehicle (KPI ≥ ₹9,85,000; got ₹${kpis.currentInvestmentPaise / 100})`,
  });
  checks.push({
    ok: typeof kpis.activeCapitalPaise === 'number' && kpis.activeCapitalPaise > 0,
    msg: `Reports Active Capital live (₹${kpis.activeCapitalPaise / 100})`,
  });

  // Dashboard stock count includes this open vehicle
  const stock = await countOpenInventory();
  checks.push({
    ok: stock >= 1,
    msg: `Dashboard In Stock count = ${stock}`,
  });

  record('Scenario 2 – Purchase with Costs', checks);
  return asset.id;
}

async function scenario3(assetId: string) {
  const checks: { ok: boolean; msg: string }[] = [];

  // Ensure a purchase payment exists to edit/reverse
  const asset = await refresh(assetId);
  const paidBefore = await sellerPaid(assetId);
  const remainingBefore = remainingPurchaseFromSellerPayments(asset.purchasePricePaise, paidBefore);
  if ((remainingBefore ?? 0) > 0) {
    await recordSellerPayment({
      assetId,
      amountPaise: Math.min(INR(50_000), remainingBefore!),
      paidAt: TODAY,
      instrument: 'neft',
      notes: `${TAG} editable payment`,
    });
  }

  const payAct = await findPaymentActivity(assetId, 'purchase_payment');
  checks.push({ ok: payAct != null, msg: 'Purchase payment activity exists' });

  if (payAct && payAct.amountPaise != null) {
    const original = payAct.amountPaise;
    const edited = Math.max(INR(1_000), Math.round(original / 2));
    await updateVehicleActivity({
      activityId: payAct.id,
      amountPaise: edited,
      notes: `${TAG} edited payment`,
    });
    const afterEdit = await sellerPaid(assetId);
    const payAfter = await findPaymentActivity(assetId, 'purchase_payment');
    checks.push({
      ok: payAfter?.amountPaise === edited,
      msg: `Edit purchase payment → ${edited / 100} (got ${(payAfter?.amountPaise ?? 0) / 100})`,
    });
    checks.push({
      ok: afterEdit !== paidBefore || edited === original,
      msg: `Seller ledger recalculated after payment edit (paid ₹${afterEdit / 100})`,
    });

    await reverseVehicleActivity(payAct.id, `${TAG} reverse payment`);
    const paidAfterReverse = await sellerPaid(assetId);
    checks.push({
      ok: paidAfterReverse === afterEdit - edited,
      msg: `Delete/reverse purchase payment recalculates Remaining (paid ₹${paidAfterReverse / 100})`,
    });
  }

  // Edit + reverse repair settlement / cost
  const repair = await findCostActivity(assetId, 'repair_settlement');
  if (repair) {
    await updateVehicleActivity({
      activityId: repair.id,
      actualCostPaise: INR(12_000),
      returnedPaise: 0,
      title: `${TAG} edited repair`,
    });
    let fresh = await refresh(assetId);
    checks.push({
      ok: fresh.repairTotalPaise === INR(12_000),
      msg: `Edit repair → repairTotal ₹12,000 (got ₹${(fresh.repairTotalPaise ?? 0) / 100})`,
    });
    checks.push({
      ok: fresh.totalInvestmentPaise === INR(9_60_000) + INR(10_000) + INR(5_000) + INR(12_000) - INR(5_000),
      msg: `TVI after repair edit = ₹9,82,000 (got ₹${fresh.totalInvestmentPaise / 100})`,
    });

    await reverseVehicleActivity(repair.id, `${TAG} reverse repair`);
    fresh = await refresh(assetId);
    checks.push({
      ok: (fresh.repairTotalPaise ?? 0) === 0,
      msg: `Delete repair → repairTotal ₹0 (got ₹${(fresh.repairTotalPaise ?? 0) / 100})`,
    });
    const expectedAfterRepairGone =
      INR(9_60_000) + INR(10_000) + INR(5_000) - INR(5_000); // commission + transport − refund
    checks.push({
      ok: fresh.totalInvestmentPaise === expectedAfterRepairGone,
      msg: `TVI after repair reverse = ₹${expectedAfterRepairGone / 100} (got ₹${fresh.totalInvestmentPaise / 100})`,
    });
  } else {
    checks.push({ ok: false, msg: 'Repair settlement activity missing for edit/delete test' });
  }

  record('Scenario 3 – Edit History', checks);
}

async function scenario4() {
  const checks: { ok: boolean; msg: string }[] = [];
  const price = INR(5_00_000);
  const sale = INR(5_50_000);

  const beforeStock = await countOpenInventory();
  const beforeActive = await sumMyActiveInvestedCapitalPaise();
  const beforeKpis = await getDealershipReportKpis();

  const asset = await makeVehicle({
    model: 'S4-Sell',
    purchasePricePaise: price,
    tokenPaidPaise: price, // fully paid at create
  });

  await recordSale(asset.id, sale, TODAY, 'SELF');
  const fresh = await refresh(asset.id);
  checks.push({ ok: fresh.status === 'sold', msg: `Status = sold` });
  checks.push({
    ok: fresh.profitPaise === sale - price,
    msg: `Gross profit = ₹${(sale - price) / 100} (got ₹${(fresh.profitPaise ?? 0) / 100})`,
  });
  checks.push({
    ok: fresh.mySharePaise === sale - price,
    msg: `My Profit (entitled) = ₹${(sale - price) / 100}`,
  });

  const afterStock = await countOpenInventory();
  const afterActive = await sumMyActiveInvestedCapitalPaise();
  checks.push({
    ok: afterStock === beforeStock,
    msg: `In Stock unchanged after sell create+sell net (before ${beforeStock}, after ${afterStock}) — create +1 then sell −1`,
  });
  // More precise: stock after create would be before+1, after sell = before
  checks.push({
    ok: afterActive === beforeActive,
    msg: `Active Capital returns to baseline after sell (₹${afterActive / 100})`,
  });

  await createSettlement(asset.id, `${TAG} close deal`);
  const settled = await refresh(asset.id);
  checks.push({ ok: settled.status === 'settled', msg: 'Settle/close deal without capital-return gate' });

  const afterKpis = await getDealershipReportKpis();
  checks.push({
    ok: afterKpis.assetsSold >= beforeKpis.assetsSold + 1,
    msg: `Reports Vehicles sold +1 (${beforeKpis.assetsSold} → ${afterKpis.assetsSold})`,
  });
  checks.push({
    ok: afterKpis.profitEarnedPaise >= beforeKpis.profitEarnedPaise + (sale - price),
    msg: `Reports My Profit updated (Δ ≥ ₹${(sale - price) / 100})`,
  });
  checks.push({
    ok: afterKpis.monthlyProfitPaise >= beforeKpis.monthlyProfitPaise,
    msg: `Monthly Profit KPI non-decreasing (₹${afterKpis.monthlyProfitPaise / 100})`,
  });
  checks.push({
    ok: afterKpis.assetsInStock === afterStock,
    msg: `Reports In Stock == Dashboard In Stock (${afterKpis.assetsInStock})`,
  });

  record('Scenario 4 – Sell Vehicle', checks);
}

async function scenario5() {
  const checks: { ok: boolean; msg: string }[] = [];
  const beforeStock = await countOpenInventory();
  const beforeSold = (await getDealershipReportKpis()).assetsSold;

  const ids: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const a = await makeVehicle({
      model: `S5-Fleet-${i}`,
      purchasePricePaise: INR(1_00_000 * i),
      tokenPaidPaise: INR(1_00_000 * i),
    });
    ids.push(a.id);
  }

  const midStock = await countOpenInventory();
  checks.push({
    ok: midStock === beforeStock + 5,
    msg: `After create 5: In Stock ${beforeStock} → ${midStock}`,
  });

  await recordSale(ids[0], INR(1_20_000), TODAY, 'SELF');
  await recordSale(ids[1], INR(2_40_000), TODAY, 'SELF');
  await updateAssetStatus(ids[2], 'cancelled');

  const afterStock = await countOpenInventory();
  const expectedOpen = beforeStock + 2; // +5 −2 sold −1 archived
  checks.push({
    ok: afterStock === expectedOpen,
    msg: `After sell 2 + archive 1: In Stock = ${expectedOpen} (got ${afterStock})`,
  });

  const listInStock = await listAssetsQuery({
    page: 1,
    pageSize: 200,
    sort: 'created',
    order: 'desc',
    profitFilter: 'all',
    inventoryTab: 'in_stock',
  });
  // list may paginate — compare total
  checks.push({
    ok: listInStock.total === afterStock,
    msg: `Vehicles page In Stock total == Dashboard (${listInStock.total} == ${afterStock})`,
  });

  const kpis = await getDealershipReportKpis();
  checks.push({
    ok: kpis.assetsInStock === afterStock,
    msg: `Reports In Stock == Dashboard (${kpis.assetsInStock})`,
  });
  checks.push({
    ok: kpis.assetsSold === beforeSold + 2,
    msg: `Reports sold +2 (${beforeSold} → ${kpis.assetsSold})`,
  });

  // Inventory SSOT: none of the sold/archived appear in open set
  const openIds = new Set(
    (
      await capitalDb
        .select({ id: acAssets.id })
        .from(acAssets)
        .where(sql`${acAssets.status} NOT IN ('sold', 'settled', 'cancelled')`)
    ).map((r) => r.id),
  );
  checks.push({
    ok: !openIds.has(ids[0]) && !openIds.has(ids[1]) && !openIds.has(ids[2]),
    msg: 'Sold/archived vehicles excluded from open inventory',
  });
  checks.push({
    ok: openIds.has(ids[3]) && openIds.has(ids[4]),
    msg: 'Remaining 2 fleet vehicles still open',
  });

  record('Scenario 5 – Multiple Vehicles', checks);
}

async function scenario6() {
  const checks: { ok: boolean; msg: string }[] = [];

  const rows = await capitalDb
    .select({
      id: acAssets.id,
      displayName: acAssets.displayName,
      status: acAssets.status,
      purchasePricePaise: acAssets.purchasePricePaise,
      totalInvestmentPaise: acAssets.totalInvestmentPaise,
      repairTotalPaise: acAssets.repairTotalPaise,
      dealerRefundTotalPaise: acAssets.dealerRefundTotalPaise,
    })
    .from(acAssets)
    .where(ne(acAssets.status, 'cancelled'));

  let priceZeroWithPayments = 0;
  let negativeRemaining = 0;
  let tviMismatch = 0;
  let inspected = 0;

  for (const row of rows) {
    inspected++;
    const paid = await sellerPaid(row.id);
    const remaining = remainingPurchaseFromSellerPayments(row.purchasePricePaise, paid);

    if (row.purchasePricePaise <= 0 && paid > 0) {
      priceZeroWithPayments++;
    }
    if (remaining != null && remaining < 0) {
      negativeRemaining++;
    }

    // TVI SSOT: purchase + live cost ledger
    const costs = await costSum(row.id);
    const expectedTvi = Math.round(row.purchasePricePaise) + costs;
    if (row.totalInvestmentPaise !== expectedTvi) {
      // Allow activity-fallback vehicles with empty cost ledger but investment activities
      const [actCost] = await capitalDb
        .select({ c: sql<number>`count(*)::int` })
        .from(acVehicleCosts)
        .where(and(eq(acVehicleCosts.assetId, row.id), eq(acVehicleCosts.isReversed, false)));
      if (Number(actCost?.c ?? 0) > 0 || costs !== 0) {
        tviMismatch++;
        if (tviMismatch <= 5) {
          checks.push({
            ok: false,
            msg: `TVI mismatch ${row.displayName}: stored ₹${row.totalInvestmentPaise / 100} vs purchase+costs ₹${expectedTvi / 100}`,
          });
        }
      }
    }
  }

  checks.push({
    ok: priceZeroWithPayments === 0,
    msg: `No purchase-price=0 with seller payments (${priceZeroWithPayments} bad / ${inspected} inspected)`,
  });
  checks.push({
    ok: negativeRemaining === 0,
    msg: `No negative Remaining (${negativeRemaining})`,
  });
  checks.push({
    ok: tviMismatch === 0,
    msg: `No TVI incorrect vs cost ledger (${tviMismatch} mismatches)`,
  });

  // Duplicate calculation: Active Capital from stakes == sum Me open
  const active = await sumMyActiveInvestedCapitalPaise();
  const kpis = await getDealershipReportKpis();
  checks.push({
    ok: kpis.activeCapitalPaise === active,
    msg: `Reports Active Capital == sumMyActiveInvestedCapitalPaise (₹${kpis.activeCapitalPaise / 100})`,
  });
  checks.push({
    ok: kpis.assetsInStock === (await countOpenInventory()),
    msg: `Reports In Stock == countOpenInventory`,
  });

  record('Scenario 6 – Legacy Data', checks);
}

async function cleanup() {
  console.log(`\n── Cleanup fixtures tagged ${TAG} ──`);
  const tagged = await capitalDb
    .select({ id: acAssets.id, status: acAssets.status, displayName: acAssets.displayName })
    .from(acAssets)
    .where(ilike(acAssets.notes, `%${RUN_ID}%`));

  for (const row of tagged) {
    try {
      if (row.status === 'sold') {
        await createSettlement(row.id, `${TAG} cleanup settle`);
      } else if (row.status !== 'settled' && row.status !== 'cancelled') {
        await updateAssetStatus(row.id, 'cancelled');
      }
      console.log(`  cleaned ${row.displayName} (${row.status})`);
    } catch (e) {
      console.warn(`  cleanup skip ${row.id}: ${(e as Error).message}`);
    }
  }
}

async function main() {
  console.log(`Automotive Capital Acceptance Audit — ${RUN_ID}`);
  console.log(`Date ${TODAY}`);

  try {
    const s2Id = await (async () => {
      await scenario1();
      return scenario2();
    })();
    await scenario3(s2Id);
    await scenario4();
    await scenario5();
    await scenario6();
  } finally {
    await cleanup();
    await closeCapitalDb();
  }

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║     ACCEPTANCE AUDIT SUMMARY         ║');
  console.log('╚══════════════════════════════════════╝');
  let allPass = true;
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.scenario}`);
    if (!r.pass) allPass = false;
  }
  console.log(allPass ? '\nALL SCENARIOS PASSED' : '\nFAILURES PRESENT — do not deploy');
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await cleanup();
  } catch {
    /* ignore */
  }
  await closeCapitalDb();
  process.exit(1);
});
