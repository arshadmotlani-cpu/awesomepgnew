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
  propertyBasisPaise,
  ownerShareBasisPaise,
  NON_PROJECTED_KINDS,
} from '@/src/owner/lib/wealth/propertyValuation';
import { ownershipSharePaise, paiseFromRupees } from '@/src/owner/lib/wealth/types';
import { writeAuditLog } from '@/src/owner/services/auditLog';

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
  notes?: string | null;
  createdBy?: string | null;
}) {
  const ownershipPctBps = Math.round((input.ownershipPct ?? 100) * 100);

  const [asset] = await ownerDb
    .insert(ooAssets)
    .values({
      name: input.name.trim(),
      assetType: 'PROPERTY',
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

export async function getPropertyDetail(assetId: string) {
  const base = await getPropertyByAssetId(assetId);
  if (!base) return null;

  const valuations = await listValuationHistory(assetId);
  const latest = await getLatestValuation(assetId);
  const assumption = await getCurrentAppreciationAssumption(assetId);

  const basis = {
    purchasePricePaise: base.property.purchasePricePaise,
    purchaseCostsPaise: base.property.purchaseCostsPaise,
    ownershipPctBps: base.asset.ownershipPctBps,
  };

  const currentValuePaise =
    latest?.valuePaise ?? propertyBasisPaise(basis);

  const appreciation = computeAppreciationMetrics({
    basis,
    currentValuePaise,
    purchaseDate: base.property.purchaseDate,
  });

  const projections =
    assumption
      ? projectionHorizons(ownerShareBasisPaise(basis), assumption.annualRateBps)
      : null;

  return {
    ...base,
    valuations,
    latestValuation: latest,
    assumption,
    currentValuePaise,
    appreciation,
    projections,
  };
}

export async function getTotalPropertyValuePaise(): Promise<number> {
  const properties = await listProperties();
  let total = 0;
  for (const { property, asset } of properties) {
    const latest = await getLatestValuation(asset.id);
    const basis = {
      purchasePricePaise: property.purchasePricePaise,
      purchaseCostsPaise: property.purchaseCostsPaise,
      ownershipPctBps: asset.ownershipPctBps,
    };
    const valuePaise = latest?.valuePaise ?? propertyBasisPaise(basis);
    total += ownershipSharePaise(valuePaise, asset.ownershipPctBps);
  }
  return total;
}
