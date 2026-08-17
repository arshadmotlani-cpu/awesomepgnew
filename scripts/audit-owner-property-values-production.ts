#!/usr/bin/env npx tsx
/**
 * Owner OS property value production audit + safe correction.
 *
 *   npx tsx scripts/audit-owner-property-values-production.ts
 *   npx tsx scripts/audit-owner-property-values-production.ts --execute
 */
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local' });

import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { sql } from 'drizzle-orm';
import { paiseToInr, formatInrAmount } from '@/src/lib/format';
import { createOwnerClient } from '@/src/owner/db/client';
import {
  acquisitionBasisPaise,
  resolveCurrentMarketValuePaise,
  ownerShareMarketValuePaise,
} from '@/src/owner/lib/wealth/propertyValuation';
import { writeAuditLog } from '@/src/owner/services/auditLog';
import { addPropertyValuation, correctPropertyAcquisitionFields } from '@/src/owner/services/properties';
import { getTotalPropertyValuePaise } from '@/src/owner/services/properties';
import { getTotalLiabilityPaise } from '@/src/owner/services/liabilities';
import { getTotalBankBalancePaise } from '@/src/owner/services/journal';

type PropertyRow = {
  asset_id: string;
  name: string;
  ownership_pct_bps: number;
  purchase_price_paise: number;
  purchase_costs_paise: number;
  purchase_date: string | null;
  purchase_costs_breakdown_json: Record<string, number> | null;
  property_id: string;
};

type ValuationRow = {
  id: string;
  asset_id: string;
  valuation_date: string;
  value_paise: number;
  kind: string;
  created_at: string;
  notes: string | null;
};

type CorrectionPlan = {
  assetId: string;
  propertyId: string;
  name: string;
  reason: string;
  oldMarketValuePaise: number;
  newMarketValuePaise: number;
  purchasePricePaise: number;
  purchaseCostsPaise: number;
  newPurchasePricePaise?: number;
  newPurchaseCostsPaise?: number;
  acquisitionBasisPaise: number;
  valuationId: string | null;
  action: 'correct_valuation' | 'correct_property_and_valuation' | 'add_valuation' | 'none';
};

function paiseFromRow(v: unknown): number {
  return Number(v ?? 0);
}

function isBuggyBasisValuation(
  val: ValuationRow,
  purchasePaise: number,
  costsPaise: number,
  basisPaise: number,
): boolean {
  const valuePaise = paiseFromRow(val.value_paise);
  if (valuePaise !== basisPaise) return false;
  if (costsPaise <= 0) return false;
  // Value equals purchase+costs but not purchase alone — likely conflated basis with market value
  if (valuePaise === purchasePaise) return false;
  // Only auto-style valuations at property creation (MARKET_ESTIMATE, no custom notes)
  if (val.kind === 'PROJECTED') return false;
  return true;
}

function hasMeaningfulCostBreakdown(breakdown: Record<string, number> | null): boolean {
  if (!breakdown || typeof breakdown !== 'object') return false;
  return Object.values(breakdown).some((v) => Number(v) > 0);
}

function isExactDoublePurchase(valuePaise: number, purchasePaise: number): boolean {
  return purchasePaise > 0 && valuePaise === purchasePaise * 2;
}

/** Costs mirror purchase magnitude with no breakdown — likely duplicate form entry. */
function isErroneousDuplicateCosts(
  purchasePaise: number,
  costsPaise: number,
  breakdown: Record<string, number> | null,
): boolean {
  if (costsPaise <= 0 || purchasePaise <= 0) return false;
  if (hasMeaningfulCostBreakdown(breakdown)) return false;
  const ratio = costsPaise / purchasePaise;
  return ratio >= 0.9 && ratio <= 1.1;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const { db, close } = createOwnerClient({ max: 2 });

  const properties = (await db.execute<PropertyRow>(sql`
    SELECT
      a.id AS asset_id,
      p.id AS property_id,
      a.name,
      a.ownership_pct_bps,
      p.purchase_price_paise,
      p.purchase_costs_paise,
      p.purchase_date,
      p.purchase_costs_breakdown_json
    FROM oo_properties p
    JOIN oo_assets a ON a.id = p.asset_id
    WHERE a.is_active = 1
    ORDER BY a.name
  `)) as PropertyRow[];

  const allValuations = (await db.execute<ValuationRow>(sql`
    SELECT id, asset_id, valuation_date, value_paise, kind, created_at::text, notes
    FROM oo_property_valuations
    WHERE kind != 'PROJECTED'
    ORDER BY asset_id, valuation_date DESC, created_at DESC
  `)) as ValuationRow[];

  const valuationsByAsset = new Map<string, ValuationRow[]>();
  for (const v of allValuations) {
    const list = valuationsByAsset.get(v.asset_id) ?? [];
    list.push(v);
    valuationsByAsset.set(v.asset_id, list);
  }

  const plans: CorrectionPlan[] = [];
  const preserved: Array<{ assetId: string; name: string; reason: string; valuePaise: number }> =
    [];

  for (const p of properties) {
    const purchasePaise = paiseFromRow(p.purchase_price_paise);
    const costsPaise = paiseFromRow(p.purchase_costs_paise);
    const ownershipBps = paiseFromRow(p.ownership_pct_bps);
    const breakdown = (p.purchase_costs_breakdown_json as Record<string, number>) ?? null;
    const basis = {
      purchasePricePaise: purchasePaise,
      purchaseCostsPaise: costsPaise,
      ownershipPctBps: ownershipBps,
    };
    const basisPaise = acquisitionBasisPaise(basis);
    const vals = valuationsByAsset.get(p.asset_id) ?? [];
    const latest = vals[0] ?? null;

    const correctMarketPaise = resolveCurrentMarketValuePaise(
      latest ? paiseFromRow(latest.value_paise) : null,
      purchasePaise,
    );

    let currentMarketPaise = latest
      ? paiseFromRow(latest.value_paise)
      : purchasePaise;

    let action: CorrectionPlan['action'] = 'none';
    let reason = 'No correction needed';
    let newMarketPaise = currentMarketPaise;

    let newPurchasePricePaise: number | undefined;
    let newPurchaseCostsPaise: number | undefined;

    if (latest && isExactDoublePurchase(paiseFromRow(latest.value_paise), purchasePaise)) {
      action = 'correct_valuation';
      newMarketPaise = purchasePaise;
      reason =
        'Valuation was exactly 2× purchase price — corrected to purchase price (doubling bug)';
    } else if (latest && isBuggyBasisValuation(latest, purchasePaise, costsPaise, basisPaise)) {
      action = 'correct_valuation';
      newMarketPaise = purchasePaise;
      reason =
        'Valuation matched acquisition basis (purchase+costs) — corrected to purchase price as current market value per fixed model';
    } else if (
      latest &&
      paiseFromRow(latest.value_paise) !== purchasePaise &&
      paiseFromRow(latest.value_paise) !== basisPaise &&
      !isExactDoublePurchase(paiseFromRow(latest.value_paise), purchasePaise)
    ) {
      preserved.push({
        assetId: p.asset_id,
        name: p.name,
        reason: 'Explicit valuation differs from purchase and basis — preserved',
        valuePaise: paiseFromRow(latest.value_paise),
      });
      action = 'none';
    } else if (
      !latest &&
      costsPaise > 0 &&
      isErroneousDuplicateCosts(purchasePaise, costsPaise, breakdown)
    ) {
      const correctedPurchase = Math.max(purchasePaise, costsPaise);
      action = 'correct_property_and_valuation';
      newPurchasePricePaise = correctedPurchase;
      newPurchaseCostsPaise = 0;
      newMarketPaise = correctedPurchase;
      reason =
        'Acquisition costs duplicate purchase magnitude with empty breakdown — old UI summed purchase+costs (doubling). Corrected purchase price and zeroed erroneous costs; market value = purchase price.';
      currentMarketPaise = basisPaise;
    } else if (!latest) {
      action = 'none';
      reason = 'No valuation record — fallback now uses purchase price only (no DB change)';
      newMarketPaise = purchasePaise;
    } else if (
      latest &&
      paiseFromRow(latest.value_paise) === purchasePaise &&
      costsPaise === 0
    ) {
      action = 'none';
      reason = 'Valuation equals purchase price with zero costs — correct';
    } else if (
      latest &&
      paiseFromRow(latest.value_paise) === purchasePaise &&
      costsPaise > 0
    ) {
      preserved.push({
        assetId: p.asset_id,
        name: p.name,
        reason: 'Valuation at purchase price despite acquisition costs — preserved as user intent',
        valuePaise: purchasePaise,
      });
    }

    if (
      (action === 'correct_valuation' && newMarketPaise !== currentMarketPaise) ||
      action === 'correct_property_and_valuation'
    ) {
      plans.push({
        assetId: p.asset_id,
        propertyId: p.property_id,
        name: p.name,
        reason,
        oldMarketValuePaise: currentMarketPaise,
        newMarketValuePaise: newMarketPaise,
        purchasePricePaise: purchasePaise,
        purchaseCostsPaise: costsPaise,
        newPurchasePricePaise,
        newPurchaseCostsPaise,
        acquisitionBasisPaise: basisPaise,
        valuationId: latest?.id ?? null,
        action,
      });
    }

    const resolvedMarket =
      action === 'correct_valuation' || action === 'correct_property_and_valuation'
        ? newMarketPaise
        : currentMarketPaise;
    const ownerShare = ownerShareMarketValuePaise(resolvedMarket, ownershipBps);

    console.log('---');
    console.log(`Property: ${p.name}`);
    console.log(`  Purchase: ${paiseToInr(purchasePaise)}`);
    console.log(`  Acquisition costs: ${paiseToInr(costsPaise)}`);
    console.log(`  Acquisition basis: ${paiseToInr(basisPaise)}`);
    console.log(
      `  Latest valuation: ${latest ? paiseToInr(paiseFromRow(latest.value_paise)) : 'none'}`,
    );
    console.log(`  Owner share (current): ${paiseToInr(ownerShare)}`);
    console.log(`  Status: ${reason}`);
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`Properties inspected: ${properties.length}`);
  console.log(`Corrections planned: ${plans.length}`);
  console.log(`Legitimate valuations preserved: ${preserved.length}`);

  if (plans.length > 0) {
    console.log('\nPlanned corrections:');
    for (const plan of plans) {
      console.log(
        `  ${plan.name}: ${paiseToInr(plan.oldMarketValuePaise)} → ${paiseToInr(plan.newMarketValuePaise)} (${plan.reason})`,
      );
    }
  }

  if (!execute) {
    console.log('\nDry run only. Re-run with --execute to apply corrections.');
    await close();
    return;
  }

  if (plans.length === 0) {
    console.log('\nNo corrections applied.');
  } else {
    console.log('\nApplying corrections...');
    const today = new Date().toISOString().slice(0, 10);
    for (const plan of plans) {
      if (plan.action === 'correct_property_and_valuation') {
        await correctPropertyAcquisitionFields({
          propertyId: plan.propertyId,
          assetId: plan.assetId,
          purchasePricePaise: plan.newPurchasePricePaise!,
          purchaseCostsPaise: plan.newPurchaseCostsPaise!,
          reason: plan.reason,
        });
      }

      const newRow = await addPropertyValuation({
        assetId: plan.assetId,
        valueRupees: plan.newMarketValuePaise / 100,
        valuationDate: today,
        kind: 'MARKET_ESTIMATE',
        notes: `Production correction: ${plan.reason}`,
      });

      await writeAuditLog({
        entityType: 'property_valuation_correction',
        entityId: plan.assetId,
        action: 'production_correct_market_value',
        beforeJson: {
          oldMarketValuePaise: plan.oldMarketValuePaise,
          oldValuationId: plan.valuationId,
          purchasePricePaise: plan.purchasePricePaise,
          purchaseCostsPaise: plan.purchaseCostsPaise,
          acquisitionBasisPaise: plan.acquisitionBasisPaise,
          newPurchasePricePaise: plan.newPurchasePricePaise,
          newPurchaseCostsPaise: plan.newPurchaseCostsPaise,
        },
        afterJson: {
          newMarketValuePaise: plan.newMarketValuePaise,
          newValuationId: newRow.id,
          reason: plan.reason,
        },
        actorId: null,
      });

      console.log(
        `  Applied: ${plan.name} ${paiseToInr(plan.oldMarketValuePaise)} → ${paiseToInr(plan.newMarketValuePaise)}`,
      );
    }
  }

  const propertyTotal = await getTotalPropertyValuePaise();
  const liabilities = await getTotalLiabilityPaise();
  const bank = await getTotalBankBalancePaise();
  const netWorth = propertyTotal + bank - liabilities;

  console.log('\nPost-correction wealth snapshot:');
  console.log(`  Property value (owner share): ${paiseToInr(propertyTotal)}`);
  console.log(`  Bank/cash: ${paiseToInr(bank)}`);
  console.log(`  Liabilities: ${paiseToInr(liabilities)}`);
  console.log(`  Net worth (assets - liabilities): ${paiseToInr(netWorth)}`);

  console.log('\nINR format spot check:');
  console.log(`  3310000 → ${paiseToInr(331000000)}`);
  console.log(`  6610000 → ${paiseToInr(661000000)}`);
  console.log(`  100000 → ${paiseToInr(10000000)}`);
  console.log(`  10000000 → ${paiseToInr(1000000000)}`);

  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
