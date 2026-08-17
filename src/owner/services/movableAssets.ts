import { and, desc, eq, ne } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import { ooAssets, ooMovableAssets, ooMovableValuations } from '@/src/owner/db/schema';
import {
  ownerShareMovableValuePaise,
  resolveMovableValueState,
} from '@/src/owner/lib/wealth/movableAssetValuation';
import { paiseFromRupees } from '@/src/owner/lib/wealth/types';
import { writeAuditLog } from '@/src/owner/services/auditLog';

export async function listMovableAssets() {
  return ownerDb
    .select({
      movable: ooMovableAssets,
      asset: ooAssets,
    })
    .from(ooMovableAssets)
    .innerJoin(ooAssets, eq(ooMovableAssets.assetId, ooAssets.id))
    .where(and(eq(ooAssets.isActive, 1), eq(ooAssets.assetClass, 'MOVABLE')))
    .orderBy(desc(ooMovableAssets.createdAt));
}

export async function getLatestMovableValuation(assetId: string, excludeProjected = true) {
  const conditions = [eq(ooMovableValuations.assetId, assetId)];
  if (excludeProjected) {
    conditions.push(ne(ooMovableValuations.kind, 'PROJECTED'));
  }

  const [row] = await ownerDb
    .select()
    .from(ooMovableValuations)
    .where(and(...conditions))
    .orderBy(desc(ooMovableValuations.valuationDate), desc(ooMovableValuations.createdAt))
    .limit(1);
  return row ?? null;
}

export async function createMovableAsset(input: {
  name: string;
  movableType?: string;
  make?: string | null;
  model?: string | null;
  purchaseDate?: string | null;
  purchasePriceRupees: number;
  ownershipPct?: number;
  annualRatePct?: number | null;
  isDepreciation?: boolean;
  currentValueRupees?: number | null;
  valuationDate?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}) {
  const ownershipPctBps = Math.round((input.ownershipPct ?? 100) * 100);
  const isDepreciation = input.isDepreciation ?? true;
  const annualRateBps =
    input.annualRatePct != null ? Math.round(input.annualRatePct * 100) : 0;

  const [asset] = await ownerDb
    .insert(ooAssets)
    .values({
      name: input.name.trim(),
      assetType: 'VEHICLE_LINK',
      assetClass: 'MOVABLE',
      ownershipPctBps,
      notes: input.notes?.trim() || null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  const [movable] = await ownerDb
    .insert(ooMovableAssets)
    .values({
      assetId: asset.id,
      movableType: input.movableType ?? 'vehicle',
      make: input.make?.trim() || null,
      model: input.model?.trim() || null,
      purchaseDate: input.purchaseDate ?? null,
      purchasePricePaise: paiseFromRupees(input.purchasePriceRupees),
      annualRateBps: isDepreciation ? -Math.abs(annualRateBps) : annualRateBps,
      isDepreciation: isDepreciation ? 1 : 0,
      notes: input.notes?.trim() || null,
    })
    .returning();

  if (input.currentValueRupees != null && input.currentValueRupees > 0) {
    await addMovableValuation({
      assetId: asset.id,
      valueRupees: input.currentValueRupees,
      valuationDate:
        input.valuationDate ?? input.purchaseDate ?? new Date().toISOString().slice(0, 10),
      kind: 'MARKET_ESTIMATE',
      createdBy: input.createdBy,
    });
  }

  await writeAuditLog({
    entityType: 'movable_asset',
    entityId: movable.id,
    action: 'create',
    afterJson: { asset, movable } as unknown as Record<string, unknown>,
    actorId: input.createdBy,
  });

  return { asset, movable };
}

export async function addMovableValuation(input: {
  assetId: string;
  valueRupees: number;
  valuationDate: string;
  kind?: 'ACTUAL' | 'APPRAISAL' | 'MARKET_ESTIMATE' | 'PROJECTED';
  notes?: string | null;
  createdBy?: string | null;
}) {
  const [row] = await ownerDb
    .insert(ooMovableValuations)
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
    entityType: 'movable_valuation',
    entityId: row.id,
    action: 'create',
    afterJson: row as unknown as Record<string, unknown>,
    actorId: input.createdBy,
  });

  return row;
}

export async function getMovableAssetDetail(assetId: string) {
  const [row] = await ownerDb
    .select({
      movable: ooMovableAssets,
      asset: ooAssets,
    })
    .from(ooMovableAssets)
    .innerJoin(ooAssets, eq(ooMovableAssets.assetId, ooAssets.id))
    .where(eq(ooMovableAssets.assetId, assetId))
    .limit(1);

  if (!row) return null;

  const latest = await getLatestMovableValuation(assetId);
  const valueState = resolveMovableValueState({
    latestValuationPaise: latest?.valuePaise,
    latestValuationKind: latest?.kind,
    latestValuationNotes: latest?.notes,
    purchasePricePaise: row.movable.purchasePricePaise,
    purchaseDate: row.movable.purchaseDate,
    annualRateBps: row.movable.annualRateBps,
    isDepreciation: row.movable.isDepreciation === 1,
  });

  const ownerCurrentValuePaise = ownerShareMovableValuePaise(
    valueState.currentValueForNetWorthPaise,
    row.asset.ownershipPctBps,
  );

  return {
    ...row,
    latestValuation: latest,
    valueState,
    ownerCurrentValuePaise,
  };
}

export async function getTotalMovableAssetValuePaise(asOfDate?: string): Promise<number> {
  const movables = await listMovableAssets();
  let total = 0;
  for (const { movable, asset } of movables) {
    const latest = await getLatestMovableValuation(asset.id);
    const valueState = resolveMovableValueState({
      latestValuationPaise: latest?.valuePaise,
      latestValuationKind: latest?.kind,
      latestValuationNotes: latest?.notes,
      purchasePricePaise: movable.purchasePricePaise,
      purchaseDate: movable.purchaseDate,
      annualRateBps: movable.annualRateBps,
      isDepreciation: movable.isDepreciation === 1,
      asOfDate,
    });
    total += ownerShareMovableValuePaise(
      valueState.currentValueForNetWorthPaise,
      asset.ownershipPctBps,
    );
  }
  return total;
}
