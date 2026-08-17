/**
 * Property income source engine — normalized repeatable income units per property.
 */
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import {
  ooIntegrationFacts,
  ooPropertyIncomeRentHistory,
  ooPropertyIncomeSources,
  ooProperties,
} from '@/src/owner/db/schema';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';
import type { SourceSystem } from '@/src/owner/lib/wealth/types';
import { writeAuditLog } from '@/src/owner/services/auditLog';
import { paiseFromRupees } from '@/src/owner/lib/wealth/types';

import type { PropertyIncomeSourceType, PropertyIncomeSourceStatus } from '@/src/owner/lib/wealth/propertyIncomeTypes';
import { isActiveIncomeStatus } from '@/src/owner/lib/wealth/propertyIncomeTypes';

export async function listPropertyIncomeSources(assetId: string) {
  return ownerDb
    .select()
    .from(ooPropertyIncomeSources)
    .where(eq(ooPropertyIncomeSources.assetId, assetId))
    .orderBy(desc(ooPropertyIncomeSources.createdAt));
}

export async function getPropertyIncomeSource(id: string) {
  const [row] = await ownerDb
    .select()
    .from(ooPropertyIncomeSources)
    .where(eq(ooPropertyIncomeSources.id, id))
    .limit(1);
  return row ?? null;
}

export async function listRentHistory(incomeSourceId: string) {
  return ownerDb
    .select()
    .from(ooPropertyIncomeRentHistory)
    .where(eq(ooPropertyIncomeRentHistory.incomeSourceId, incomeSourceId))
    .orderBy(desc(ooPropertyIncomeRentHistory.effectiveFrom));
}

async function appendRentHistory(input: {
  incomeSourceId: string;
  effectiveFrom: string;
  monthlyAmountPaise: number;
  notes?: string | null;
  createdBy?: string | null;
  closePrevious?: boolean;
}) {
  if (input.closePrevious) {
    await ownerDb
      .update(ooPropertyIncomeRentHistory)
      .set({ effectiveTo: input.effectiveFrom })
      .where(
        and(
          eq(ooPropertyIncomeRentHistory.incomeSourceId, input.incomeSourceId),
          sql`${ooPropertyIncomeRentHistory.effectiveTo} IS NULL`,
        ),
      );
  }

  const [row] = await ownerDb
    .insert(ooPropertyIncomeRentHistory)
    .values({
      incomeSourceId: input.incomeSourceId,
      effectiveFrom: input.effectiveFrom,
      monthlyAmountPaise: input.monthlyAmountPaise,
      notes: input.notes?.trim() || null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return row;
}

export async function createPropertyIncomeSource(input: {
  assetId: string;
  sourceType: PropertyIncomeSourceType;
  name: string;
  tenantName?: string | null;
  monthlyAmountRupees: number;
  securityDepositRupees?: number;
  startDate?: string | null;
  endDate?: string | null;
  status?: PropertyIncomeSourceStatus;
  linkedPgId?: string | null;
  sourceSystem?: SourceSystem | null;
  sourceReferenceId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}) {
  const [property] = await ownerDb
    .select({ linkedPgId: ooProperties.linkedPgId })
    .from(ooProperties)
    .where(eq(ooProperties.assetId, input.assetId))
    .limit(1);

  const propertyLinkedPg = property?.linkedPgId ?? null;

  if (input.sourceType === 'PG' && propertyLinkedPg) {
    if (!input.linkedPgId || input.linkedPgId === propertyLinkedPg) {
      const existing = await ownerDb
        .select({ id: ooPropertyIncomeSources.id })
        .from(ooPropertyIncomeSources)
        .where(
          and(
            eq(ooPropertyIncomeSources.assetId, input.assetId),
            eq(ooPropertyIncomeSources.sourceType, 'PG'),
            eq(ooPropertyIncomeSources.sourceSystem, 'AWESOME_PG'),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new Error(
          'PG income is synced from Awesome PG for this property — do not add a duplicate PG source.',
        );
      }
      if (input.monthlyAmountRupees > 0 && input.sourceSystem !== 'AWESOME_PG') {
        throw new Error(
          'Cannot manually enter PG rental when property is linked to Awesome PG.',
        );
      }
    }
  }

  const monthlyAmountPaise = paiseFromRupees(input.monthlyAmountRupees);
  const isPgSynced =
    input.sourceType === 'PG' &&
    (input.sourceSystem === 'AWESOME_PG' || (propertyLinkedPg && input.linkedPgId));

  const [row] = await ownerDb
    .insert(ooPropertyIncomeSources)
    .values({
      assetId: input.assetId,
      sourceType: input.sourceType,
      name: input.name.trim(),
      tenantName: input.tenantName?.trim() || null,
      monthlyAmountPaise: isPgSynced && propertyLinkedPg ? 0 : monthlyAmountPaise,
      securityDepositPaise: paiseFromRupees(input.securityDepositRupees ?? 0),
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      status: input.status ?? 'ACTIVE',
      sourceSystem: isPgSynced ? 'AWESOME_PG' : input.sourceSystem ?? null,
      sourceReferenceId: input.sourceReferenceId ?? input.linkedPgId ?? null,
      linkedPgId: input.linkedPgId ?? propertyLinkedPg ?? null,
      notes: input.notes?.trim() || null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  if (monthlyAmountPaise > 0 && !isPgSynced) {
    await appendRentHistory({
      incomeSourceId: row.id,
      effectiveFrom: input.startDate ?? new Date().toISOString().slice(0, 10),
      monthlyAmountPaise,
      notes: 'Initial rent',
      createdBy: input.createdBy,
    });
  }

  await writeAuditLog({
    entityType: 'property_income_source',
    entityId: row.id,
    action: 'create',
    afterJson: row as unknown as Record<string, unknown>,
    actorId: input.createdBy,
  });

  return row;
}

export async function updatePropertyIncomeSource(input: {
  id: string;
  name?: string;
  tenantName?: string | null;
  status?: PropertyIncomeSourceStatus;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  actorId?: string | null;
}) {
  const existing = await getPropertyIncomeSource(input.id);
  if (!existing) throw new Error('Income source not found');

  const [updated] = await ownerDb
    .update(ooPropertyIncomeSources)
    .set({
      name: input.name?.trim() ?? existing.name,
      tenantName: input.tenantName !== undefined ? input.tenantName?.trim() || null : existing.tenantName,
      status: input.status ?? existing.status,
      startDate: input.startDate !== undefined ? input.startDate : existing.startDate,
      endDate: input.endDate !== undefined ? input.endDate : existing.endDate,
      notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
      updatedAt: new Date(),
    })
    .where(eq(ooPropertyIncomeSources.id, input.id))
    .returning();

  await writeAuditLog({
    entityType: 'property_income_source',
    entityId: input.id,
    action: 'update',
    beforeJson: existing as unknown as Record<string, unknown>,
    afterJson: updated as unknown as Record<string, unknown>,
    actorId: input.actorId,
  });

  return updated;
}

export async function changePropertyIncomeRent(input: {
  incomeSourceId: string;
  monthlyAmountRupees: number;
  effectiveFrom: string;
  notes?: string | null;
  actorId?: string | null;
}) {
  const existing = await getPropertyIncomeSource(input.incomeSourceId);
  if (!existing) throw new Error('Income source not found');

  if (existing.sourceSystem === 'AWESOME_PG') {
    throw new Error('PG-linked income is synced from Awesome PG — cannot change rent manually.');
  }

  const monthlyAmountPaise = paiseFromRupees(input.monthlyAmountRupees);

  const [updated] = await ownerDb
    .update(ooPropertyIncomeSources)
    .set({
      monthlyAmountPaise,
      updatedAt: new Date(),
    })
    .where(eq(ooPropertyIncomeSources.id, input.incomeSourceId))
    .returning();

  await appendRentHistory({
    incomeSourceId: input.incomeSourceId,
    effectiveFrom: input.effectiveFrom,
    monthlyAmountPaise,
    notes: input.notes ?? 'Rent change',
    createdBy: input.actorId,
    closePrevious: true,
  });

  await writeAuditLog({
    entityType: 'property_income_source',
    entityId: input.incomeSourceId,
    action: 'rent_change',
    beforeJson: { monthlyAmountPaise: existing.monthlyAmountPaise } as Record<string, unknown>,
    afterJson: { monthlyAmountPaise, effectiveFrom: input.effectiveFrom } as Record<string, unknown>,
    actorId: input.actorId,
  });

  return updated;
}

export async function deletePropertyIncomeSource(input: {
  id: string;
  actorId?: string | null;
}) {
  const existing = await getPropertyIncomeSource(input.id);
  if (!existing) throw new Error('Income source not found');

  if (existing.sourceSystem === 'AWESOME_PG') {
    throw new Error('Cannot delete PG-synced income source — unlink PG or mark inactive.');
  }

  await ownerDb.delete(ooPropertyIncomeSources).where(eq(ooPropertyIncomeSources.id, input.id));

  await writeAuditLog({
    entityType: 'property_income_source',
    entityId: input.id,
    action: 'delete',
    beforeJson: existing as unknown as Record<string, unknown>,
    actorId: input.actorId,
  });
}

/** PG integration revenue for asset in period (actual received / accrued from PG). */
export async function getPgIntegrationIncomeForAsset(
  assetId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const [row] = await ownerDb
    .select({
      total: sql<number>`COALESCE(SUM(${ooIntegrationFacts.amountPaise}), 0)::bigint`,
    })
    .from(ooIntegrationFacts)
    .where(
      and(
        eq(ooIntegrationFacts.assetId, assetId),
        eq(ooIntegrationFacts.sourceSystem, 'AWESOME_PG'),
        inArray(ooIntegrationFacts.kind, ['REVENUE', 'PROFIT']),
        gte(ooIntegrationFacts.periodStart, startDate),
        lte(ooIntegrationFacts.periodEnd, endDate),
      ),
    );

  return Number(row?.total ?? 0);
}

export type PropertyIncomeTotals = {
  grossMonthlyPaise: number;
  grossAnnualizedPaise: number;
  activeCount: number;
  vacantCount: number;
  inactiveCount: number;
  byType: Record<string, number>;
  sources: Array<{
    id: string;
    name: string;
    sourceType: string;
    tenantName: string | null;
    monthlyAmountPaise: number;
    status: string;
    sourceSystem: string | null;
    linkedPgId: string | null;
    isPgSynced: boolean;
    pgIntegrationActualPaise: number;
  }>;
  pgIntegrationActualPaise: number;
};

export async function getPropertyIncomeTotals(
  assetId: string,
  opts?: { periodStart?: string; periodEnd?: string },
): Promise<PropertyIncomeTotals> {
  const sources = await listPropertyIncomeSources(assetId);

  const pgIntegrationPaise =
    opts?.periodStart && opts?.periodEnd
      ? await getPgIntegrationIncomeForAsset(assetId, opts.periodStart, opts.periodEnd)
      : 0;

  const byType: Record<string, number> = {};
  let grossMonthlyPaise = 0;
  let activeCount = 0;
  let vacantCount = 0;
  let inactiveCount = 0;

  const mapped = sources.map((s) => {
    const isPgSynced = s.sourceSystem === 'AWESOME_PG';
    const monthly = coerceWealthPaise(s.monthlyAmountPaise);

    if (s.status === 'ACTIVE') activeCount += 1;
    else if (s.status === 'VACANT') vacantCount += 1;
    else inactiveCount += 1;

    return {
      id: s.id,
      name: s.name,
      sourceType: s.sourceType,
      tenantName: s.tenantName,
      monthlyAmountPaise: monthly,
      status: s.status,
      sourceSystem: s.sourceSystem,
      linkedPgId: s.linkedPgId,
      isPgSynced,
      pgIntegrationActualPaise: isPgSynced ? pgIntegrationPaise : 0,
    };
  });

  for (const s of sources) {
    if (!isActiveIncomeStatus(s.status)) continue;
    const monthly = coerceWealthPaise(s.monthlyAmountPaise);
    grossMonthlyPaise += monthly;
    byType[s.sourceType] = (byType[s.sourceType] ?? 0) + monthly;
  }

  return {
    grossMonthlyPaise,
    grossAnnualizedPaise: grossMonthlyPaise * 12,
    activeCount,
    vacantCount,
    inactiveCount,
    byType,
    pgIntegrationActualPaise: pgIntegrationPaise,
    sources: mapped,
  };
}

export async function ensurePgIncomeSourceForProperty(assetId: string, linkedPgId: string) {
  const existing = await ownerDb
    .select({ id: ooPropertyIncomeSources.id })
    .from(ooPropertyIncomeSources)
    .where(
      and(
        eq(ooPropertyIncomeSources.assetId, assetId),
        eq(ooPropertyIncomeSources.sourceType, 'PG'),
      ),
    )
    .limit(1);

  if (existing.length > 0) return existing[0];

  return createPropertyIncomeSource({
    assetId,
    sourceType: 'PG',
    name: 'Awesome PG',
    monthlyAmountRupees: 0,
    linkedPgId,
    sourceSystem: 'AWESOME_PG',
    sourceReferenceId: linkedPgId,
    status: 'ACTIVE',
  });
}

export type PortfolioPropertyIncomeSummary = {
  propertyCount: number;
  totalGrossMonthlyPaise: number;
  totalGrossAnnualizedPaise: number;
  totalActiveSources: number;
  totalVacantSources: number;
  properties: Array<{
    assetId: string;
    name: string;
    grossMonthlyPaise: number;
    grossAnnualizedPaise: number;
  }>;
};

export async function getPortfolioPropertyIncomeSummary(opts?: {
  periodStart?: string;
  periodEnd?: string;
}): Promise<PortfolioPropertyIncomeSummary> {
  const { listProperties } = await import('@/src/owner/services/properties');
  const properties = await listProperties();

  let totalGrossMonthlyPaise = 0;
  let totalActiveSources = 0;
  let totalVacantSources = 0;
  const propertyRows: PortfolioPropertyIncomeSummary['properties'] = [];

  for (const { asset } of properties) {
    const totals = await getPropertyIncomeTotals(asset.id, {
      periodStart: opts?.periodStart,
      periodEnd: opts?.periodEnd,
    });
    totalGrossMonthlyPaise += totals.grossMonthlyPaise;
    totalActiveSources += totals.activeCount;
    totalVacantSources += totals.vacantCount;
    propertyRows.push({
      assetId: asset.id,
      name: asset.name,
      grossMonthlyPaise: totals.grossMonthlyPaise,
      grossAnnualizedPaise: totals.grossAnnualizedPaise,
    });
  }

  return {
    propertyCount: properties.length,
    totalGrossMonthlyPaise,
    totalGrossAnnualizedPaise: totalGrossMonthlyPaise * 12,
    totalActiveSources,
    totalVacantSources,
    properties: propertyRows,
  };
}
