/**
 * Seed six historical SOLD/CLOSED vehicle investments (Dec 2025 → mid-2026).
 * Total realised MY profit = ₹480,000 (50% of ₹9,60,000 business profit).
 * Business profit = ₹9,60,000 with 50:50 Me / Investor 2 funding + profit split.
 *
 * Usage:
 *   INVEST_DATABASE_DATABASE_URL=... npx tsx scripts/seed-capital-history.ts
 *   # or with env already loaded:
 *   npx tsx scripts/seed-capital-history.ts
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();

import { eq } from 'drizzle-orm';
import { capitalDb } from '../src/capital/db/client';
import { acAssets, acAutomotiveDetails, acCapitalInvestments } from '../src/capital/db/schema';
import { rupeesToPaise } from '../src/capital/lib/money';
import { createCapitalInvestment } from '../src/capital/services/capital';
import { createAsset, recordSale, updateAssetStatus } from '../src/capital/services/assets';
import { createExpense } from '../src/capital/services/expenses';
import { createPayment } from '../src/capital/services/payments';
import { createSettlement } from '../src/capital/services/settlements';
import { listCategories } from '../src/capital/services/categories';

const HISTORY_TAG = 'HISTORICAL_CLOSED_SEED_v1';

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
  miscRupees: number;
  saleDate: string;
  /** Realised profit in rupees — sale = investment + profit */
  profitRupees: number;
};

const VEHICLES: VehiclePlan[] = [
  {
    manufacturer: 'Maruti Suzuki',
    model: 'Swift',
    variant: 'VXI',
    year: 2019,
    registrationNumber: 'MH12AC2501',
    color: 'Pearl White',
    purchaseDate: '2025-12-05',
    purchaseRupees: 425_000,
    repairRupees: 35_000,
    miscRupees: 8_000,
    saleDate: '2026-01-18',
    profitRupees: 72_000,
  },
  {
    manufacturer: 'Hyundai',
    model: 'i20',
    variant: 'Sportz',
    year: 2020,
    registrationNumber: 'MH14BD2612',
    color: 'Polar White',
    purchaseDate: '2025-12-22',
    purchaseRupees: 510_000,
    repairRupees: 42_000,
    miscRupees: 12_000,
    saleDate: '2026-02-14',
    profitRupees: 85_000,
  },
  {
    manufacturer: 'Tata',
    model: 'Nexon',
    variant: 'XZ+',
    year: 2021,
    registrationNumber: 'MH12CF2703',
    color: 'Daytona Grey',
    purchaseDate: '2026-01-18',
    purchaseRupees: 680_000,
    repairRupees: 55_000,
    miscRupees: 15_000,
    saleDate: '2026-03-08',
    profitRupees: 78_000,
  },
  {
    manufacturer: 'Honda',
    model: 'City',
    variant: 'VX CVT',
    year: 2018,
    registrationNumber: 'MH04DG2804',
    color: 'Modern Steel',
    purchaseDate: '2026-02-10',
    purchaseRupees: 720_000,
    repairRupees: 48_000,
    miscRupees: 10_000,
    saleDate: '2026-04-15',
    profitRupees: 90_000,
  },
  {
    manufacturer: 'Toyota',
    model: 'Innova Crysta',
    variant: 'GX 7S',
    year: 2017,
    registrationNumber: 'MH12EH2905',
    color: 'Super White',
    purchaseDate: '2026-03-25',
    purchaseRupees: 1_250_000,
    repairRupees: 85_000,
    miscRupees: 20_000,
    saleDate: '2026-05-30',
    profitRupees: 75_000,
  },
  {
    manufacturer: 'Mahindra',
    model: 'XUV300',
    variant: 'W8',
    year: 2020,
    registrationNumber: 'MH14FJ3006',
    color: 'Red Rage',
    purchaseDate: '2026-05-12',
    purchaseRupees: 890_000,
    repairRupees: 60_000,
    miscRupees: 18_000,
    saleDate: '2026-07-02',
    profitRupees: 80_000,
  },
];

function inr(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

async function alreadySeeded(): Promise<boolean> {
  for (const v of VEHICLES) {
    const [row] = await capitalDb
      .select({ reg: acAutomotiveDetails.registrationNumber })
      .from(acAutomotiveDetails)
      .where(eq(acAutomotiveDetails.registrationNumber, v.registrationNumber))
      .limit(1);
    if (row) return true;
  }
  return false;
}

async function main() {
  const profitSum = VEHICLES.reduce((s, v) => s + v.profitRupees, 0);
  if (profitSum !== 480_000) {
    throw new Error(`Profit sum must be 480000, got ${profitSum}`);
  }

  if (await alreadySeeded()) {
    console.log('Historical seed already present — skipping create. Computing summary…');
    await printSummary();
    process.exit(0);
  }

  const categories = await listCategories();
  const repair = categories.find((c) => c.slug === 'repair');
  const misc = categories.find((c) => c.slug === 'miscellaneous');
  if (!repair || !misc) {
    throw new Error('Required categories missing — run capital:db:seed first');
  }

  const totalPurchase = VEHICLES.reduce((s, v) => s + v.purchaseRupees, 0);
  const totalExpenses = VEHICLES.reduce((s, v) => s + v.repairRupees + v.miscRupees, 0);
  const capitalNeeded = totalPurchase + totalExpenses;

  // Pool capital in two tranches matching business start
  console.log('→ Injecting capital pool…');
  await createCapitalInvestment({
    investedAt: '2025-12-01',
    amountPaise: rupeesToPaise(Math.ceil(capitalNeeded * 0.55)),
    paymentMode: 'neft',
    referenceNumber: 'HIST-CAP-001',
    notes: `${HISTORY_TAG} — initial capital Dec 2025`,
  });
  await createCapitalInvestment({
    investedAt: '2026-02-01',
    amountPaise: rupeesToPaise(Math.ceil(capitalNeeded * 0.45)),
    paymentMode: 'neft',
    referenceNumber: 'HIST-CAP-002',
    notes: `${HISTORY_TAG} — top-up Feb 2026`,
  });

  const created: Array<{
    reg: string;
    label: string;
    purchase: number;
    expenses: number;
    investment: number;
    sale: number;
    profit: number;
  }> = [];

  for (const v of VEHICLES) {
    const investment = v.purchaseRupees + v.repairRupees + v.miscRupees;
    const saleRupees = investment + v.profitRupees;

    console.log(`→ ${v.manufacturer} ${v.model} (${v.registrationNumber})…`);

    const asset = await createAsset({
      manufacturer: v.manufacturer,
      model: v.model,
      variant: v.variant,
      year: v.year,
      fuelType: 'petrol',
      ownership: 'first_owner',
      registrationNumber: v.registrationNumber,
      color: v.color,
      purchaseDate: v.purchaseDate,
      purchasePricePaise: rupeesToPaise(v.purchaseRupees),
      notes: HISTORY_TAG,
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

    await createExpense({
      assetId: asset.id,
      categoryId: misc.id,
      expenseDate: addDays(v.purchaseDate, 10),
      vendor: 'Misc vendors',
      amountPaise: rupeesToPaise(v.miscRupees),
      description: `Miscellaneous expenses — RTO / cleaning / docs`,
      paymentMethod: 'cash',
      notes: HISTORY_TAG,
    });

    await updateAssetStatus(asset.id, 'listed');
    await recordSale(asset.id, rupeesToPaise(saleRupees), v.saleDate);

    // Capital return (full investment)
    await createPayment({
      assetId: asset.id,
      receivedAt: v.saleDate,
      amountPaise: rupeesToPaise(investment),
      paymentType: 'capital_returned',
      capitalReturnedPaise: rupeesToPaise(investment),
      profitPaise: 0,
      adjustmentPaise: 0,
      paymentMode: 'neft',
      referenceNumber: `HIST-CAPRET-${v.registrationNumber}`,
      notes: HISTORY_TAG,
    });

    // Profit realised
    await createPayment({
      assetId: asset.id,
      receivedAt: v.saleDate,
      amountPaise: rupeesToPaise(v.profitRupees),
      paymentType: 'profit',
      capitalReturnedPaise: 0,
      profitPaise: rupeesToPaise(v.profitRupees),
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
      expenses: v.repairRupees + v.miscRupees,
      investment,
      sale: saleRupees,
      profit: v.profitRupees,
    });
  }

  console.log('\n========== HISTORICAL SEED COMPLETE ==========\n');
  for (const c of created) {
    console.log(
      `${c.reg}  ${c.label}\n` +
        `  Purchase ${inr(c.purchase)} + Expenses ${inr(c.expenses)} = Investment ${inr(c.investment)}\n` +
        `  Sale ${inr(c.sale)} → Profit ${inr(c.profit)}\n`,
    );
  }

  const purchaseTotal = created.reduce((s, c) => s + c.purchase, 0);
  const expenseTotal = created.reduce((s, c) => s + c.expenses, 0);
  const saleTotal = created.reduce((s, c) => s + c.sale, 0);
  const profitTotal = created.reduce((s, c) => s + c.profit, 0);
  const avgProfit = Math.round(profitTotal / created.length);

  console.log('---------- TOTALS ----------');
  console.log(`Vehicles created:     ${created.length} (all settled/closed)`);
  console.log(`Purchase totals:      ${inr(purchaseTotal)}`);
  console.log(`Total expenses:       ${inr(expenseTotal)}`);
  console.log(`Sale totals:          ${inr(saleTotal)}`);
  console.log(`Total realised profit:${inr(profitTotal)}`);
  console.log(`Average profit:       ${inr(avgProfit)}`);
  console.log(`Capital pool injected:${inr(capitalNeeded)}`);

  await printSummary();
  process.exit(0);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
      reg: acAutomotiveDetails.registrationNumber,
    })
    .from(acAssets)
    .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId))
    .where(eq(acAssets.notes, HISTORY_TAG));

  const [cap] = await capitalDb
    .select()
    .from(acCapitalInvestments)
    .where(eq(acCapitalInvestments.notes, `${HISTORY_TAG} — initial capital Dec 2025`))
    .limit(1);

  console.log(`\nDB check: ${sold.length} historical assets tagged ${HISTORY_TAG}`);
  for (const s of sold) {
    console.log(
      `  [${s.status}] ${s.reg} profit=${inr((s.profit ?? 0) / 100)} sale=${inr((s.sale ?? 0) / 100)}`,
    );
  }
  const dbProfit = sold.reduce((a, s) => a + (s.profit ?? 0), 0) / 100;
  console.log(`DB total profit: ${inr(dbProfit)}`);
  if (cap) console.log(`Capital tranche 1 present: yes`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
