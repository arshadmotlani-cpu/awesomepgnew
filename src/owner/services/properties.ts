import { and, desc, eq, ne } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import {
  ooAssets,
  ooProperties,
  ooPropertyAppreciationAssumptions,
  ooPropertyValuations,
} from '@/src/owner/db/schema';
import {
  computeAppreciationMetrics,
  projectionHorizons,
  acquisitionBasisPaise,
  resolvePropertyValueState,
  ownerShareBasisPaise,
  ownerShareMarketValuePaise,
  NON_PROJECTED_KINDS,
} from '@/src/owner/lib/wealth/propertyValuation';
import { paiseFromRupees } from '@/src/owner/lib/wealth/types';
import { writeAuditLog } from '@/src/owner/services/auditLog';
import {
  createPropertyIncomeSource,
  ensurePgIncomeSourceForProperty,
} from '@/src/owner/services/propertyIncomeSources';
import type { PropertyIncomeSourceType } from '@/src/owner/lib/wealth/propertyIncomeTypes';

export async function listProperties() {
  return ownerDb
    .select({
      property: ooProperties,
      asset: ooAssets,
    })
    .from(ooProperties)
    .innerJoin(ooAssets, eq(ooProperties.assetId, ooAssets.id))
    .where(eq(ooAssets.isActive, 1))
    .orderBy(desc(ooProperties.createdAt));
}

export async function getPropertyByAssetId(assetId: string) {
  const [row] = await ownerDb
    .select({
      property: ooProperties,
      asset: ooAssets,
    })
    .from(ooProperties)
    .innerJoin(ooAssets, eq(ooProperties.assetId, ooAssets.id))
    .where(eq(ooProperties.assetId, assetId))
    .limit(1);
  return row ?? null;
}

export async function getLatestValuation(assetId: string, excludeProjected = true) {
  const conditions = [eq(ooPropertyValuations.assetId, assetId)];
  if (excludeProjected) {
    conditions.push(ne(ooPropertyValuations.kind, 'PROJECTED'));
  }

  const [row] = await ownerDb
    .select()
    .from(ooPropertyValuations)
    .where(and(...conditions))
    .orderBy(desc(ooPropertyValuations.valuationDate), desc(ooPropertyValuations.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listValuationHistory(assetId: string) {
  return ownerDb
    .select()
    .from(ooPropertyValuations)
    .where(eq(ooPropertyValuations.assetId, assetId))
    .orderBy(desc(ooPropertyValuations.valuationDate));
}

export async function getCurrentAppreciationAssumption(assetId: string) {
  const [row] = await ownerDb
    .select()
    .from(ooPropertyAppreciationAssumptions)
    .where(eq(ooPropertyAppreciationAssumptions.assetId, assetId))
    .orderBy(desc(ooPropertyAppreciationAssumptions.effectiveFrom))
    .limit(1);
  return row ?? null;
}

export async function createProperty(input: {
  name: string;
  propertyType?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  purchaseDate?: string | null;
  purchasePriceRupees: number;
  purchaseCostsRupees?: number;
  purchaseCostsBreakdown?: Record<string, number>;
  ownershipPct?: number;
  linkedPgId?: string | null;
  annualAppreciationPct?: number | null;
  appreciationMethod?: string;
  currentValueRupees?: number | null;
  valuationDate?: string | null;
  monthlyRentalIncomeRupees?: number;
  otherMonthlyIncomeRupees?: number;
  incomeSources?: Array<{
    sourceType: PropertyIncomeSourceType;
    name: string;
    tenantName?: string | null;
    monthlyAmountRupees: number;
    securityDepositRupees?: number;
    startDate?: string | null;
    status?: 'ACTIVE' | 'VACANT' | 'INACTIVE';
    notes?: string | null;
  }>;
  notes?: string | null;
  createdBy?: string | null;
}) {
  const ownershipPctBps = Math.round((input.ownershipPct ?? 100) * 100);

  const [asset] = await ownerDb
    .insert(ooAssets)
    .values({
      name: input.name.trim(),
      assetType: 'PROPERTY',
      assetClass: 'FIXED',
      ownershipPctBps,
      linkedPgId: input.linkedPgId ?? null,
      notes: input.notes?.trim() || null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  const [property] = await ownerDb
    .insert(ooProperties)
    .values({
      assetId: asset.id,
      propertyType: input.propertyType ?? 'residential',
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      country: input.country?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      purchaseDate: input.purchaseDate ?? null,
      purchasePricePaise: paiseFromRupees(input.purchasePriceRupees),
      purchaseCostsPaise: paiseFromRupees(input.purchaseCostsRupees ?? 0),
      purchaseCostsBreakdownJson: input.purchaseCostsBreakdown ?? {},
      appreciationMethod: input.appreciationMethod ?? 'FLAT_ANNUAL',
      monthlyRentalIncomePaise: paiseFromRupees(input.monthlyRentalIncomeRupees ?? 0),
      otherMonthlyIncomePaise: paiseFromRupees(input.otherMonthlyIncomeRupees ?? 0),
      linkedPgId: input.linkedPgId ?? null,
      notes: input.notes?.trim() || null,
    })
    .returning();

  if (input.annualAppreciationPct != null) {
    await ownerDb.insert(ooPropertyAppreciationAssumptions).values({
      assetId: asset.id,
      annualRateBps: Math.round(input.annualAppreciationPct * 100),
      effectiveFrom: input.purchaseDate ?? new Date().toISOString().slice(0, 10),
    });
  }

  if (input.linkedPgId) {
    await ensurePgIncomeSourceForProperty(asset.id, input.linkedPgId);
  }

  if (input.incomeSources?.length) {
    for (const src of input.incomeSources) {
      if (src.sourceType === 'PG' && input.linkedPgId) continue;
      await createPropertyIncomeSource({
        assetId: asset.id,
        sourceType: src.sourceType,
        name: src.name,
        tenantName: src.tenantName,
        monthlyAmountRupees: src.monthlyAmountRupees,
        securityDepositRupees: src.securityDepositRupees,
        startDate: src.startDate ?? input.purchaseDate,
        status: src.status ?? 'ACTIVE',
        notes: src.notes,
        createdBy: input.createdBy,
      });
    }
  } else if (!input.linkedPgId) {
    const legacyRental = input.monthlyRentalIncomeRupees ?? 0;
    const legacyOther = input.otherMonthlyIncomeRupees ?? 0;
    if (legacyRental > 0) {
      await createPropertyIncomeSource({
        assetId: asset.id,
        sourceType: 'OTHER',
        name: 'Monthly rental',
        monthlyAmountRupees: legacyRental,
        startDate: input.purchaseDate,
        createdBy: input.createdBy,
      });
    }
    if (legacyOther > 0) {
      await createPropertyIncomeSource({
        assetId: asset.id,
        sourceType: 'OTHER',
        name: 'Other income',
        monthlyAmountRupees: legacyOther,
        startDate: input.purchaseDate,
        createdBy: input.createdBy,
      });
    }
  }

  if (input.currentValueRupees != null && input.currentValueRupees > 0) {
    await addPropertyValuation({
      assetId: asset.id,
      valueRupees: input.currentValueRupees,
      valuationDate:
        input.valuationDate ?? input.purchaseDate ?? new Date().toISOString().slice(0, 10),
      kind: 'MARKET_ESTIMATE',
      createdBy: input.createdBy,
    });
  }

  await writeAuditLog({
    entityType: 'property',
    entityId: property.id,
    action: 'create',
    afterJson: { asset, property } as unknown as Record<string, unknown>,
    actorId: input.createdBy,
  });

  return { asset, property };
}

export async function addPropertyValuation(input: {
  assetId: string;
  valueRupees: number;
  valuationDate: string;
  kind?: 'ACTUAL' | 'APPRAISAL' | 'MARKET_ESTIMATE' | 'PROJECTED';
  notes?: string | null;
  createdBy?: string | null;
}) {
  const [row] = await ownerDb
    .insert(ooPropertyValuations)
    .values({
      assetId: input.assetId,
      valuationDate: input.valuationDate,
      valuePaise: paiseFromRupees(input.valueRupees),
      kind: input.kind ?? 'MARKET_ESTIMATE',
      notes: input.notes?.trim() || null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  await writeAuditLog({
    entityType: 'property_valuation',
    entityId: row.id,
    action: 'create',
    afterJson: row as unknown as Record<string, unknown>,
    actorId: input.createdBy,
  });

  return row;
}

/** Production-safe correction of erroneous purchase/cost fields with audit trail. */
export async function correctPropertyAcquisitionFields(input: {
  propertyId: string;
  assetId: string;
  purchasePricePaise: number;
  purchaseCostsPaise: number;
  purchaseCostsBreakdown?: Record<string, number>;
  reason: string;
  actorId?: string | null;
}) {
  const existing = await getPropertyByAssetId(input.assetId);
  if (!existing) {
    throw new Error(`Property not found for asset ${input.assetId}`);
  }

  const before = {
    purchasePricePaise: existing.property.purchasePricePaise,
    purchaseCostsPaise: existing.property.purchaseCostsPaise,
    purchaseCostsBreakdownJson: existing.property.purchaseCostsBreakdownJson,
  };

  const [updated] = await ownerDb
    .update(ooProperties)
    .set({
      purchasePricePaise: input.purchasePricePaise,
      purchaseCostsPaise: input.purchaseCostsPaise,
      purchaseCostsBreakdownJson: input.purchaseCostsBreakdown ?? {},
      updatedAt: new Date(),
    })
    .where(eq(ooProperties.id, input.propertyId))
    .returning();

  await writeAuditLog({
    entityType: 'property',
    entityId: input.propertyId,
    action: 'production_correct_acquisition_fields',
    beforeJson: before as unknown as Record<string, unknown>,
    afterJson: {
      purchasePricePaise: input.purchasePricePaise,
      purchaseCostsPaise: input.purchaseCostsPaise,
      purchaseCostsBreakdownJson: input.purchaseCostsBreakdown ?? {},
      reason: input.reason,
      property: updated,
    } as unknown as Record<string, unknown>,
    actorId: input.actorId ?? null,
  });

  return updated;
}

export async function getPropertyDetail(assetId: string, asOfDate?: string) {
  const base = await getPropertyByAssetId(assetId);
  if (!base) return null;

  const valuations = await listValuationHistory(assetId);
  const latest = await getLatestValuation(assetId);
  const assumption = await getCurrentAppreciationAssumption(assetId);
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);

  const basis = {
    purchasePricePaise: base.property.purchasePricePaise,
    purchaseCostsPaise: base.property.purchaseCostsPaise,
    ownershipPctBps: base.asset.ownershipPctBps,
  };

  const valueState = resolvePropertyValueState({
    latestValuationPaise: latest?.valuePaise,
    latestValuationKind: latest?.kind,
    latestValuationNotes: latest?.notes,
    purchasePricePaise: base.property.purchasePricePaise,
    purchaseDate: base.property.purchaseDate,
    annualRateBps: assumption?.annualRateBps,
    asOfDate: asOf,
  });

  const currentMarketValuePaise = valueState.currentValueForNetWorthPaise;

  const appreciation = computeAppreciationMetrics({
    basis,
    currentValuePaise: currentMarketValuePaise,
    purchaseDate: base.property.purchaseDate,
    asOfDate: asOf,
  });

  const ownerMarketValuePaise = ownerShareMarketValuePaise(
    currentMarketValuePaise,
    basis.ownershipPctBps,
  );

  const ownerEstimatedMarketValuePaise = ownerShareMarketValuePaise(
    valueState.estimatedMarketValuePaise,
    basis.ownershipPctBps,
  );

  const projections =
    assumption
      ? projectionHorizons(ownerMarketValuePaise, assumption.annualRateBps)
      : null;

  return {
    ...base,
    valuations,
    latestValuation: latest,
    assumption,
    valueState,
    currentMarketValuePaise,
    acquisitionBasisPaise: acquisitionBasisPaise(basis),
    ownerAcquisitionBasisPaise: ownerShareBasisPaise(basis),
    ownerMarketValuePaise,
    ownerEstimatedMarketValuePaise,
    appreciation,
    projections,
  };
}

export async function getTotalPropertyValuePaise(asOfDate?: string): Promise<number> {
  const properties = await listProperties();
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  let total = 0;
  for (const { property, asset } of properties) {
    const latest = await getLatestValuation(asset.id);
    const assumption = await getCurrentAppreciationAssumption(asset.id);
    const valueState = resolvePropertyValueState({
      latestValuationPaise: latest?.valuePaise,
      latestValuationKind: latest?.kind,
      latestValuationNotes: latest?.notes,
      purchasePricePaise: property.purchasePricePaise,
      purchaseDate: property.purchaseDate,
      annualRateBps: assumption?.annualRateBps,
      asOfDate: asOf,
    });
    total += ownerShareMarketValuePaise(
      valueState.currentValueForNetWorthPaise,
      asset.ownershipPctBps,
    );
  }
  return total;
}
