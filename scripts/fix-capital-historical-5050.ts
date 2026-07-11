/**
 * Correct historical seed deals to true 50:50 partnership economics.
 *
 * Seed originally stored MY take-home as profit_paise with 100% my share.
 * Real model: Business Profit = 2 × my share, Partner = my share, funding 50/50.
 *
 * Target totals: Business ₹9,60,000 · My ₹4,80,000 · Partner ₹4,80,000
 *
 * Usage: npx tsx scripts/fix-capital-historical-5050.ts
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();

import { and, eq, sql } from 'drizzle-orm';
import { createCapitalClient } from '../src/capital/db/client';
import { acAssetInvestors, acAssets } from '../src/capital/db/schema';
import { calcRoiBps } from '../src/capital/lib/money';

const HISTORY_TAG = 'HISTORICAL_CLOSED_SEED_v1';
const FIX_TAG = 'HISTORICAL_5050_FIX_v1';

async function main() {
  const { db, close } = createCapitalClient({ max: 1 });

  const assets = await db
    .select()
    .from(acAssets)
    .where(
      and(
        sql`${acAssets.notes} ILIKE ${'%' + HISTORY_TAG + '%'}`,
        sql`${acAssets.profitPaise} IS NOT NULL`,
        sql`${acAssets.status} <> 'cancelled'`,
      ),
    );

  if (assets.length === 0) {
    console.log('No historical seed assets found.');
    await close();
    return;
  }

  console.log(`Found ${assets.length} historical assets to convert to 50:50…\n`);

  let businessTotal = 0;
  let myTotal = 0;
  let partnerTotal = 0;

  for (const asset of assets) {
    if (asset.notes?.includes(FIX_TAG)) {
      console.log(`skip (already fixed): ${asset.displayName}`);
      continue;
    }

    const myShare = asset.mySharePaise ?? asset.profitPaise ?? 0;
    // Recorded profit was my take-home under 100% backfill → true business = 2×
    const businessProfit = myShare * 2;
    const partnerShare = myShare;
    const purchase = asset.purchasePricePaise;
    const meInvested = Math.round(purchase / 2);
    const partnerInvested = purchase - meInvested;
    const businessRoi = calcRoiBps(businessProfit, purchase);
    const myRoi = calcRoiBps(myShare, meInvested);
    const partnerRoi = calcRoiBps(partnerShare, partnerInvested);
    const extraSale = myShare; // add partner's profit into sale proceeds
    const newSale =
      asset.actualSalePricePaise != null
        ? asset.actualSalePricePaise + extraSale
        : null;

    await db.transaction(async (tx) => {
      await tx
        .update(acAssets)
        .set({
          profitPaise: businessProfit,
          actualSalePricePaise: newSale ?? undefined,
          mySharePaise: myShare,
          partnerSharePaise: partnerShare,
          mySharePctBps: 5000,
          partnerSharePctBps: 5000,
          profitShareMode: 'percentage',
          businessRoiBps: businessRoi,
          myRoiBps: myRoi,
          roiBps: businessRoi,
          notes: `${asset.notes ?? ''} | ${FIX_TAG}`.trim(),
          updatedAt: new Date(),
        })
        .where(eq(acAssets.id, asset.id));

      // Replace investor rows
      await tx.delete(acAssetInvestors).where(eq(acAssetInvestors.assetId, asset.id));
      await tx.insert(acAssetInvestors).values([
        {
          assetId: asset.id,
          slot: 'me',
          label: 'Me',
          investedPaise: meInvested,
          profitPaise: myShare,
          roiBps: myRoi,
        },
        {
          assetId: asset.id,
          slot: 'investor_2',
          label: 'Investor 2',
          investedPaise: partnerInvested,
          profitPaise: partnerShare,
          roiBps: partnerRoi,
        },
      ]);
    });

    businessTotal += businessProfit;
    myTotal += myShare;
    partnerTotal += partnerShare;

    console.log(
      `${asset.displayName}: business ₹${businessProfit / 100} · me ₹${myShare / 100} · partner ₹${partnerShare / 100}`,
    );
  }

  console.log('\n========== TOTALS ==========');
  console.log(`Business Profit: ₹${(businessTotal / 100).toLocaleString('en-IN')}`);
  console.log(`My Profit:       ₹${(myTotal / 100).toLocaleString('en-IN')}`);
  console.log(`Partner Profit:  ₹${(partnerTotal / 100).toLocaleString('en-IN')}`);

  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
