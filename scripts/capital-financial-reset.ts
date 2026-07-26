/**
 * Capital financial reset — keep only In Stock (open inventory) vehicle masters,
 * wipe all money history, delete sold/settled/archived vehicles.
 *
 * Usage:
 *   npx tsx scripts/capital-financial-reset.ts           # dry-run (default)
 *   npx tsx scripts/capital-financial-reset.ts --execute # destructive
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();

import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { closeCapitalDb, capitalDb } from '../src/capital/db/client';
import {
  acActivityLog,
  acAssetInvestors,
  acAssets,
  acAutomotiveDetails,
  acCapitalInvestments,
  acDocuments,
  acDrafts,
  acExpenses,
  acLedgerEntries,
  acManualProfits,
  acPaymentsReceived,
  acRepairAdvances,
  acSellerPayments,
  acSettlements,
  acVehicleActivities,
  acVehicleCosts,
} from '../src/capital/db/schema';
import { isOpenInventoryStatus } from '../src/capital/services/inventory';

const EXECUTE = process.argv.includes('--execute');

async function countTable(label: string, query: Promise<{ c: number }[]>): Promise<number> {
  const [row] = await query;
  const n = Number(row?.c ?? 0);
  console.log(`  ${label}: ${n}`);
  return n;
}

async function main() {
  console.log(EXECUTE ? '=== CAPITAL FINANCIAL RESET — EXECUTE ===' : '=== CAPITAL FINANCIAL RESET — DRY RUN ===');
  console.log('');

  const allAssets = await capitalDb
    .select({
      id: acAssets.id,
      displayName: acAssets.displayName,
      status: acAssets.status,
    })
    .from(acAssets);

  const keep = allAssets.filter((a) => isOpenInventoryStatus(a.status));
  const drop = allAssets.filter((a) => !isOpenInventoryStatus(a.status));
  const keepIds = keep.map((a) => a.id);
  const dropIds = drop.map((a) => a.id);

  console.log(`Total assets: ${allAssets.length}`);
  console.log(`Keep (open inventory): ${keep.length}`);
  for (const a of keep) {
    console.log(`  + ${a.status.padEnd(12)} ${a.displayName} (${a.id})`);
  }
  console.log(`Delete (closed): ${drop.length}`);
  for (const a of drop) {
    console.log(`  - ${a.status.padEnd(12)} ${a.displayName} (${a.id})`);
  }
  console.log('');

  console.log('Financial row counts (before):');
  await countTable(
    'ac_seller_payments',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acSellerPayments),
  );
  await countTable(
    'ac_vehicle_costs',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acVehicleCosts),
  );
  await countTable(
    'ac_vehicle_activities',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acVehicleActivities),
  );
  await countTable(
    'ac_repair_advances',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acRepairAdvances),
  );
  await countTable('ac_expenses', capitalDb.select({ c: sql<number>`count(*)::int` }).from(acExpenses));
  await countTable(
    'ac_payments_received',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acPaymentsReceived),
  );
  await countTable(
    'ac_settlements',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acSettlements),
  );
  await countTable(
    'ac_ledger_entries',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acLedgerEntries),
  );
  await countTable(
    'ac_capital_investments',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acCapitalInvestments),
  );
  await countTable(
    'ac_manual_profits',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acManualProfits),
  );
  await countTable(
    'ac_asset_investors',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acAssetInvestors),
  );
  await countTable('ac_drafts', capitalDb.select({ c: sql<number>`count(*)::int` }).from(acDrafts));
  await countTable(
    'ac_activity_log',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acActivityLog),
  );
  console.log('');

  if (!EXECUTE) {
    console.log('Dry-run only. Re-run with --execute to apply.');
    await closeCapitalDb();
    process.exit(0);
  }

  await capitalDb.transaction(async (tx) => {
    // --- 1. Delete closed vehicles + dependents (FK-safe) ---
    if (dropIds.length > 0) {
      console.log(`Deleting ${dropIds.length} closed vehicles…`);

      await tx
        .update(acDocuments)
        .set({ expenseId: null, paymentId: null })
        .where(inArray(acDocuments.assetId, dropIds));

      await tx.delete(acDocuments).where(inArray(acDocuments.assetId, dropIds));

      // Break ledger FKs on child tables before deleting ledger / parents
      await tx
        .update(acSellerPayments)
        .set({ ledgerEntryId: null, activityId: null })
        .where(inArray(acSellerPayments.assetId, dropIds));
      await tx
        .update(acVehicleCosts)
        .set({ ledgerEntryId: null, activityId: null })
        .where(inArray(acVehicleCosts.assetId, dropIds));
      await tx
        .update(acVehicleActivities)
        .set({ ledgerEntryId: null })
        .where(inArray(acVehicleActivities.assetId, dropIds));
      await tx.delete(acSellerPayments).where(inArray(acSellerPayments.assetId, dropIds));
      await tx.delete(acVehicleCosts).where(inArray(acVehicleCosts.assetId, dropIds));
      await tx.delete(acVehicleActivities).where(inArray(acVehicleActivities.assetId, dropIds));
      await tx.delete(acRepairAdvances).where(inArray(acRepairAdvances.assetId, dropIds));
      await tx.delete(acExpenses).where(inArray(acExpenses.assetId, dropIds));
      await tx.delete(acPaymentsReceived).where(inArray(acPaymentsReceived.assetId, dropIds));
      await tx.delete(acSettlements).where(inArray(acSettlements.assetId, dropIds));
      await tx.delete(acLedgerEntries).where(inArray(acLedgerEntries.assetId, dropIds));
      await tx.delete(acAssetInvestors).where(inArray(acAssetInvestors.assetId, dropIds));
      await tx.delete(acAutomotiveDetails).where(inArray(acAutomotiveDetails.assetId, dropIds));
      await tx
        .delete(acActivityLog)
        .where(and(eq(acActivityLog.entityType, 'asset'), inArray(acActivityLog.entityId, dropIds)));
      await tx.delete(acAssets).where(inArray(acAssets.id, dropIds));
    }

    // --- 2. Wipe ALL remaining financial tables (kept vehicles become fresh) ---
    console.log('Wiping financial ledgers…');

    await tx.update(acDocuments).set({ expenseId: null, paymentId: null });

    await tx
      .update(acSellerPayments)
      .set({ ledgerEntryId: null, activityId: null });
    await tx.update(acVehicleCosts).set({ ledgerEntryId: null, activityId: null });
    await tx.update(acVehicleActivities).set({ ledgerEntryId: null });

    await tx.delete(acSellerPayments);
    await tx.delete(acVehicleCosts);
    await tx.delete(acVehicleActivities);
    await tx.delete(acRepairAdvances);
    await tx.delete(acExpenses);
    await tx.delete(acPaymentsReceived);
    await tx.delete(acSettlements);
    await tx.delete(acLedgerEntries);
    await tx.delete(acCapitalInvestments);
    await tx.delete(acManualProfits);
    await tx.delete(acAssetInvestors);
    await tx.delete(acDrafts);
    await tx.delete(acActivityLog);

    // --- 3. Reset financial columns on kept assets ---
    if (keepIds.length > 0) {
      console.log(`Resetting financial columns on ${keepIds.length} kept vehicles…`);
      await tx
        .update(acAssets)
        .set({
          purchasePricePaise: 0,
          expectedTotalInvestmentPaise: 0,
          sellerPricePaise: 0,
          currentInvestmentPaise: 0,
          budgetRemainingPaise: 0,
          expectedSalePricePaise: null,
          actualSalePricePaise: null,
          saleDate: null,
          buyerName: null,
          totalExpensePaise: 0,
          repairTotalPaise: 0,
          dealerRefundTotalPaise: 0,
          totalInvestmentPaise: 0,
          fundingGapPaise: 0,
          holdingDays: null,
          profitPaise: null,
          roiBps: null,
          profitDistributionMode: null,
          profitShareMode: null,
          partnerSharePctBps: null,
          mySharePctBps: null,
          myInvestmentPctBps: null,
          partnerSharePaise: null,
          operatingPartnerProfitPaise: null,
          investorProfitPoolPaise: null,
          mySharePaise: null,
          businessRoiBps: null,
          myRoiBps: null,
          capitalReturnedPaise: 0,
          profitReceivedPaise: 0,
          outstandingPaise: 0,
          settlementPctBps: null,
          cancelledAt: null,
          cancelReason: null,
          updatedAt: new Date(),
        })
        .where(inArray(acAssets.id, keepIds));
    }
  });

  console.log('');
  console.log('After:');
  const remaining = await capitalDb
    .select({ id: acAssets.id, displayName: acAssets.displayName, status: acAssets.status })
    .from(acAssets);
  console.log(`  assets: ${remaining.length}`);
  for (const a of remaining) {
    console.log(`  * ${a.status.padEnd(12)} ${a.displayName}`);
  }
  await countTable(
    'ac_seller_payments',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acSellerPayments),
  );
  await countTable(
    'ac_vehicle_costs',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acVehicleCosts),
  );
  await countTable(
    'ac_vehicle_activities',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acVehicleActivities),
  );
  await countTable(
    'ac_ledger_entries',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acLedgerEntries),
  );
  await countTable(
    'ac_asset_investors',
    capitalDb.select({ c: sql<number>`count(*)::int` }).from(acAssetInvestors),
  );

  // Sanity: every remaining asset must be open inventory
  const bad = remaining.filter((a) => !isOpenInventoryStatus(a.status));
  if (bad.length > 0) {
    console.error('ERROR: non-open assets remain after reset:', bad);
    await closeCapitalDb();
    process.exit(1);
  }

  console.log('');
  console.log('Reset complete.');
  await closeCapitalDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeCapitalDb().catch(() => undefined);
  process.exit(1);
});
