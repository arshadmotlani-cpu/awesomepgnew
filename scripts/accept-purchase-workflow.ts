/**
 * Acceptance: purchase workflow TVI + payment remaining.
 * Run: npx tsx scripts/accept-purchase-workflow.ts
 *
 * Creates a throwaway vehicle, applies the plan scenario, asserts DB figures,
 * then archives the vehicle.
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();

import { eq } from 'drizzle-orm';
import { capitalDb } from '../src/capital/db/client';
import { acAssets, acVehicleActivities } from '../src/capital/db/schema';
import {
  remainingPurchasePaymentPaise,
  sumPaymentMilestonesPaise,
} from '../src/capital/lib/activityTypes';
import { derivedBadges } from '../src/capital/lib/vehicleLifecycle';
import { rupeesToPaise } from '../src/capital/lib/money';
import { createAsset, cancelAsset } from '../src/capital/services/assets';
import {
  createVehicleActivity,
  recordPurchasePayment,
} from '../src/capital/services/vehicleActivities';

const INR = (r: number) => rupeesToPaise(r);

async function main() {
  const purchaseDate = new Date().toISOString().slice(0, 10);
  const asset = await createAsset({
    manufacturer: 'Acceptance',
    model: 'Workflow',
    year: 2024,
    fuelType: 'petrol',
    ownership: 'first_owner',
    purchaseDate,
    purchasePricePaise: INR(4_70_000),
    tokenPaidPaise: INR(10_000),
    investors: [{ slot: 'me', investedPaise: INR(4_70_000), label: 'My Investment' }],
  });

  console.log('created', asset.id);

  await recordPurchasePayment({
    assetId: asset.id,
    amountPaise: INR(4_07_300),
    paidAt: purchaseDate,
  });

  await createVehicleActivity({
    assetId: asset.id,
    activityType: 'broker_commission',
    activityAt: purchaseDate,
    amountPaise: INR(10_000),
  });
  await createVehicleActivity({
    assetId: asset.id,
    activityType: 'transport',
    activityAt: purchaseDate,
    amountPaise: INR(7_300),
  });
  await createVehicleActivity({
    assetId: asset.id,
    activityType: 'miscellaneous',
    activityAt: purchaseDate,
    amountPaise: INR(20_000),
    title: 'Repairs',
  });
  await createVehicleActivity({
    assetId: asset.id,
    activityType: 'miscellaneous',
    activityAt: purchaseDate,
    amountPaise: INR(-5_000),
    title: 'Repair Refund',
  });

  const [fresh] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, asset.id)).limit(1);
  const acts = await capitalDb
    .select({
      activityType: acVehicleActivities.activityType,
      amountPaise: acVehicleActivities.amountPaise,
      isReversed: acVehicleActivities.isReversed,
    })
    .from(acVehicleActivities)
    .where(eq(acVehicleActivities.assetId, asset.id));

  const live = acts.filter((a) => !a.isReversed);
  const paid = sumPaymentMilestonesPaise(live);
  const remaining = remainingPurchasePaymentPaise(fresh.purchasePricePaise, paid);
  const badges = derivedBadges({
    status: fresh.status,
    purchasePricePaise: fresh.purchasePricePaise,
    milestonesPaidPaise: paid,
    fundingGapPaise: fresh.fundingGapPaise,
  });

  const expectedTvi = INR(5_02_300);
  const expectedRemaining = INR(52_700);

  console.log({
    tvi: fresh.totalInvestmentPaise,
    expectedTvi,
    remaining,
    expectedRemaining,
    fundingGap: fresh.fundingGapPaise,
    badges,
  });

  if (fresh.totalInvestmentPaise !== expectedTvi) {
    throw new Error(`TVI ${fresh.totalInvestmentPaise} != ${expectedTvi}`);
  }
  if (remaining !== expectedRemaining) {
    throw new Error(`Remaining ${remaining} != ${expectedRemaining}`);
  }
  if (!badges.some((b) => b.id === 'purchase_pending')) {
    throw new Error('Expected Purchase Pending while remaining > 0');
  }
  if (fresh.fundingGapPaise !== 0) {
    throw new Error('Expected Fully funded (funding gap 0)');
  }

  await recordPurchasePayment({
    assetId: asset.id,
    amountPaise: expectedRemaining,
    paidAt: purchaseDate,
  });

  const [done] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, asset.id)).limit(1);
  const acts2 = await capitalDb
    .select({
      activityType: acVehicleActivities.activityType,
      amountPaise: acVehicleActivities.amountPaise,
      isReversed: acVehicleActivities.isReversed,
    })
    .from(acVehicleActivities)
    .where(eq(acVehicleActivities.assetId, asset.id));
  const paid2 = sumPaymentMilestonesPaise(acts2.filter((a) => !a.isReversed));
  const rem2 = remainingPurchasePaymentPaise(done.purchasePricePaise, paid2);
  const badges2 = derivedBadges({
    status: done.status,
    purchasePricePaise: done.purchasePricePaise,
    milestonesPaidPaise: paid2,
    fundingGapPaise: done.fundingGapPaise,
  });

  if (rem2 !== 0) throw new Error(`Final remaining ${rem2} != 0`);
  if (badges2.some((b) => b.id === 'purchase_pending')) {
    throw new Error('Purchase Pending should clear when remaining = 0');
  }
  if (done.totalInvestmentPaise !== expectedTvi) {
    throw new Error('TVI changed after final payment (should not)');
  }

  await cancelAsset(asset.id, 'Acceptance test cleanup');
  console.log('ACCEPTANCE PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
