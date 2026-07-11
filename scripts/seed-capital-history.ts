/**
 * Seed six historical 50/50 MG / Tata Harrier deals (Dec 2025 → May 2026).
 *
 * Per vehicle: purchase ₹11,00,000 · Business profit ₹1,60,000 · My / Partner ₹80k each
 * Portfolio: Business ₹9,60,000 · My ₹4,80,000
 *
 * Idempotent: wipes prior HISTORICAL_* seed assets (and related rows) before insert.
 *
 * Usage: npx tsx scripts/seed-capital-history.ts
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();

import { eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { capitalDb } from '../src/capital/db/client';
import {
  acActivityLog,
  acAssetInvestors,
  acAssets,
  acAutomotiveDetails,
  acCapitalInvestments,
  acDocuments,
  acExpenses,
  acLedgerEntries,
  acPaymentsReceived,
  acSettlements,
} from '../src/capital/db/schema';
import { rupeesToPaise } from '../src/capital/lib/money';
import { createCapitalInvestment } from '../src/capital/services/capital';
import { createAsset, recordSale, updateAssetStatus } from '../src/capital/services/assets';
import { createExpense } from '../src/capital/services/expenses';
import { createPayment } from '../src/capital/services/payments';
import { createSettlement } from '../src/capital/services/settlements';
import { listCategories } from '../src/capital/services/categories';

const HISTORY_TAG = 'HISTORICAL_MG_HARRIER_v2';
const LEGACY_TAGS = [
  'HISTORICAL_CLOSED_SEED_v1',
  'HISTORICAL_5050_FIX',
  'HISTORICAL_MG_HARRIER',
  HISTORY_TAG,
] as const;

type VehiclePlan = {
  manufacturer: string;
  model: string;
  variant: string;
  year: number;
  registrationNumber: string;
  color: string;
  purchaseDate: string;
  purchaseRupees: number;
  repairRupees: number;
  saleDate: string;
  /** Business profit — sale = net vehicle cost + profit */
  profitRupees: number;
};

const PURCHASE = 11_00_000;
const PROFIT = 1_60_000;
const REPAIR = 25_000; // small cost line so ledger is non-trivial

const VEHICLES: VehiclePlan[] = [
  {
    manufacturer: 'MG',
    model: 'Hector',
    variant: 'Sharp',
    year: 2021,
    registrationNumber: 'MH12MG2501',
    color: 'Glaze Red',
    purchaseDate: '2025-12-08',
    purchaseRupees: PURCHASE,
    repairRupees: REPAIR,
    saleDate: '2026-01-12',
    profitRupees: PROFIT,
  },
  {
    manufacturer: 'Tata',
    model: 'Harrier',
    variant: 'XZ+',
    year: 2022,
    registrationNumber: 'MH14HR2602',
    color: 'Daytona Grey',
    purchaseDate: '2026-01-10',
    purchaseRupees: PURCHASE,
    repairRupees: REPAIR,
    saleDate: '2026-02-18',
    profitRupees: PROFIT,
  },
  {
    manufacturer: 'MG',
    model: 'Astor',
    variant: 'Savvy',
    year: 2022,
    registrationNumber: 'MH12MG2703',
    color: 'Aurora Silver',
    purchaseDate: '2026-02-05',
    purchaseRupees: PURCHASE,
    repairRupees: REPAIR,
    saleDate: '2026-03-20',
    profitRupees: PROFIT,
  },
  {
    manufacturer: 'Tata',
    model: 'Harrier',
    variant: 'XZA+',
    year: 2021,
    registrationNumber: 'MH04HR2804',
    color: 'Calgary White',
    purchaseDate: '2026-03-08',
    purchaseRupees: PURCHASE,
    repairRupees: REPAIR,
    saleDate: '2026-04-22',
    profitRupees: PROFIT,
  },
  {
    manufacturer: 'MG',
    model: 'Hector Plus',
    variant: 'Smart',
    year: 2020,
    registrationNumber: 'MH12MG2905',
    color: 'Starry Black',
    purchaseDate: '2026-04-05',
    purchaseRupees: PURCHASE,
    repairRupees: REPAIR,
    saleDate: '2026-05-18',
    profitRupees: PROFIT,
  },
  {
    manufacturer: 'Tata',
    model: 'Harrier',
    variant: 'XZ',
    year: 2023,
    registrationNumber: 'MH14HR3006',
    color: 'Oberon Black',
    purchaseDate: '2026-05-10',
    purchaseRupees: PURCHASE,
    repairRupees: REPAIR,
    saleDate: '2026-06-28',
    profitRupees: PROFIT,
  },
];

function inr(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function wipeHistoricalSeed() {
  const tagConds = LEGACY_TAGS.map((t) => ilike(acAssets.notes, `%${t}%`));
  const historical = await capitalDb
    .select({ id: acAssets.id, name: acAssets.displayName, notes: acAssets.notes })
    .from(acAssets)
    .where(or(...tagConds));

  if (historical.length === 0) {
    console.log('No prior historical seed assets to wipe.');
  } else {
    const ids = historical.map((a) => a.id);
    console.log(`→ Wiping ${ids.length} historical asset(s)…`);
    for (const a of historical) {
      console.log(`    ${a.name} (${a.notes})`);
    }

    await capitalDb.transaction(async (tx) => {
      await tx.delete(acDocuments).where(inArray(acDocuments.assetId, ids));
      await tx.delete(acSettlements).where(inArray(acSettlements.assetId, ids));
      await tx.delete(acPaymentsReceived).where(inArray(acPaymentsReceived.assetId, ids));
      await tx.delete(acExpenses).where(inArray(acExpenses.assetId, ids));
      await tx.delete(acLedgerEntries).where(inArray(acLedgerEntries.assetId, ids));
      // Best-effort activity cleanup (non-blocking for orphan log rows)
      await tx
        .delete(acActivityLog)
        .where(
          sql`${acActivityLog.entityType} = 'asset' AND ${acActivityLog.entityId} IN (${sql.join(
            ids.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`,
        );
      await tx.delete(acAutomotiveDetails).where(inArray(acAutomotiveDetails.assetId, ids));
      await tx.delete(acAssetInvestors).where(inArray(acAssetInvestors.assetId, ids));
      await tx.delete(acAssets).where(inArray(acAssets.id, ids));
    });
  }

  // Wipe historical capital injections
  const caps = await capitalDb
    .select({ id: acCapitalInvestments.id, notes: acCapitalInvestments.notes })
    .from(acCapitalInvestments)
    .where(
      or(
        ...LEGACY_TAGS.map((t) => ilike(acCapitalInvestments.notes, `%${t}%`)),
        ilike(acCapitalInvestments.referenceNumber, 'HIST-CAP-%'),
        ilike(acCapitalInvestments.referenceNumber, 'HIST-MG-%'),
      ),
    );
  if (caps.length > 0) {
    console.log(`→ Wiping ${caps.length} historical capital injection(s)…`);
    for (const c of caps) {
      await capitalDb.transaction(async (tx) => {
        await tx
          .delete(acLedgerEntries)
          .where(
            sql`${acLedgerEntries.sourceTable} = 'ac_capital_investments' AND ${acLedgerEntries.sourceId} = ${c.id}`,
          );
        await tx.delete(acCapitalInvestments).where(eq(acCapitalInvestments.id, c.id));
      });
    }
  }
}

async function main() {
  const businessTotal = VEHICLES.reduce((s, v) => s + v.profitRupees, 0);
  if (businessTotal !== 9_60_000) {
    throw new Error(`Business profit sum must be 960000, got ${businessTotal}`);
  }
  if (VEHICLES.length !== 6) {
    throw new Error(`Expected 6 vehicles, got ${VEHICLES.length}`);
  }

  await wipeHistoricalSeed();

  const categories = await listCategories();
  const repair = categories.find((c) => c.slug === 'repair');
  if (!repair) {
    throw new Error('Required category "repair" missing — run capital:db:seed first');
  }

  const halfPurchase = Math.round(PURCHASE / 2);
  const myCapitalPool = halfPurchase * VEHICLES.length;

  console.log('→ Injecting my capital pool…');
  await createCapitalInvestment({
    investedAt: '2025-12-01',
    amountPaise: rupeesToPaise(myCapitalPool),
    paymentMode: 'neft',
    referenceNumber: 'HIST-MG-CAP-001',
    notes: `${HISTORY_TAG} — my capital pool for six 50/50 deals`,
  });

  const created: Array<{
    reg: string;
    label: string;
    purchase: number;
    expenses: number;
    netCost: number;
    sale: number;
    profit: number;
    myProfit: number;
  }> = [];

  for (const v of VEHICLES) {
    const netCost = v.purchaseRupees + v.repairRupees;
    const saleRupees = netCost + v.profitRupees;
    const myProfit = Math.round(v.profitRupees / 2);
    const meInvested = Math.round(v.purchaseRupees / 2);
    const partnerInvested = v.purchaseRupees - meInvested;

    console.log(`→ ${v.manufacturer} ${v.model} (${v.registrationNumber})…`);

    const asset = await createAsset({
      manufacturer: v.manufacturer,
      model: v.model,
      variant: v.variant,
      year: v.year,
      fuelType: 'diesel',
      ownership: 'second_owner',
      registrationNumber: v.registrationNumber,
      color: v.color,
      purchaseDate: v.purchaseDate,
      purchasePricePaise: rupeesToPaise(v.purchaseRupees),
      notes: HISTORY_TAG,
      investors: [
        { slot: 'me', investedPaise: rupeesToPaise(meInvested), label: 'Me' },
        {
          slot: 'investor_2',
          investedPaise: rupeesToPaise(partnerInvested),
          label: 'Investor 2',
        },
      ],
    });

    await createExpense({
      assetId: asset.id,
      categoryId: repair.id,
      expenseDate: addDays(v.purchaseDate, 5),
      vendor: 'Local workshop',
      amountPaise: rupeesToPaise(v.repairRupees),
      description: `Repairs / reconditioning — ${v.manufacturer} ${v.model}`,
      paymentMethod: 'upi',
      notes: HISTORY_TAG,
    });

    await updateAssetStatus(asset.id, 'listed');
    await recordSale(asset.id, rupeesToPaise(saleRupees), v.saleDate);

    // Full vehicle cost returned so settlement outstanding = 0
    await createPayment({
      assetId: asset.id,
      receivedAt: v.saleDate,
      amountPaise: rupeesToPaise(netCost),
      paymentType: 'capital_returned',
      capitalReturnedPaise: rupeesToPaise(netCost),
      profitPaise: 0,
      adjustmentPaise: 0,
      paymentMode: 'neft',
      referenceNumber: `HIST-CAPRET-${v.registrationNumber}`,
      notes: HISTORY_TAG,
    });

    // My profit only (partner profit is not cash into this OS)
    await createPayment({
      assetId: asset.id,
      receivedAt: v.saleDate,
      amountPaise: rupeesToPaise(myProfit),
      paymentType: 'profit',
      capitalReturnedPaise: 0,
      profitPaise: rupeesToPaise(myProfit),
      adjustmentPaise: 0,
      paymentMode: 'upi',
      referenceNumber: `HIST-PROFIT-${v.registrationNumber}`,
      notes: HISTORY_TAG,
    });

    await createSettlement(asset.id, `${HISTORY_TAG} — closed historical deal`);

    created.push({
      reg: v.registrationNumber,
      label: `${v.manufacturer} ${v.model} ${v.variant}`,
      purchase: v.purchaseRupees,
      expenses: v.repairRupees,
      netCost,
      sale: saleRupees,
      profit: v.profitRupees,
      myProfit,
    });
  }

  console.log('\n========== HISTORICAL MG/HARRIER SEED COMPLETE ==========\n');
  for (const c of created) {
    console.log(
      `${c.reg}  ${c.label}\n` +
        `  Purchase ${inr(c.purchase)} + Expenses ${inr(c.expenses)} = Net cost ${inr(c.netCost)}\n` +
        `  Sale ${inr(c.sale)} → Business ${inr(c.profit)} · My ${inr(c.myProfit)}\n`,
    );
  }

  const purchaseTotal = created.reduce((s, c) => s + c.purchase, 0);
  const costTotal = created.reduce((s, c) => s + c.netCost, 0);
  const profitTotal = created.reduce((s, c) => s + c.profit, 0);
  const myTotal = created.reduce((s, c) => s + c.myProfit, 0);

  console.log('---------- TOTALS ----------');
  console.log(`Vehicles:             ${created.length} settled`);
  console.log(`Purchase totals:      ${inr(purchaseTotal)}`);
  console.log(`Total vehicle cost:   ${inr(costTotal)}`);
  console.log(`Business profit:      ${inr(profitTotal)}`);
  console.log(`My profit:            ${inr(myTotal)}`);
  console.log(`Business ROI (cost):  ${((profitTotal / costTotal) * 100).toFixed(2)}%`);
  console.log(`My ROI (stake):       ${((myTotal / myCapitalPool) * 100).toFixed(2)}%`);

  await printSummary();
  process.exit(0);
}

async function printSummary() {
  const sold = await capitalDb
    .select({
      id: acAssets.id,
      name: acAssets.displayName,
      status: acAssets.status,
      purchase: acAssets.purchasePricePaise,
      expense: acAssets.totalExpensePaise,
      investment: acAssets.totalInvestmentPaise,
      sale: acAssets.actualSalePricePaise,
      profit: acAssets.profitPaise,
      myShare: acAssets.mySharePaise,
      businessRoi: acAssets.businessRoiBps,
      myRoi: acAssets.myRoiBps,
      reg: acAutomotiveDetails.registrationNumber,
    })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(ilike(acAssets.notes, `%${HISTORY_TAG}%`));

  console.log(`\nDB check: ${sold.length} assets tagged ${HISTORY_TAG}`);
  for (const s of sold) {
    console.log(
      `  [${s.status}] ${s.reg} biz=${inr((s.profit ?? 0) / 100)} my=${inr((s.myShare ?? 0) / 100)} ` +
        `cost=${inr((s.investment ?? 0) / 100)} bizROI=${((s.businessRoi ?? 0) / 100).toFixed(1)}% ` +
        `myROI=${((s.myRoi ?? 0) / 100).toFixed(1)}%`,
    );
  }
  const dbBiz = sold.reduce((a, s) => a + (s.profit ?? 0), 0) / 100;
  const dbMy = sold.reduce((a, s) => a + (s.myShare ?? 0), 0) / 100;
  console.log(`DB business profit: ${inr(dbBiz)}`);
  console.log(`DB my profit:       ${inr(dbMy)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
