import { and, eq } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import { ooIntegrationFacts } from '@/src/owner/db/schema';
import type { IntegrationFactKind, SourceSystem } from '@/src/owner/lib/wealth/types';

export type IntegrationFactInput = {
  sourceSystem: SourceSystem;
  externalRef: string;
  periodStart: string;
  periodEnd: string;
  kind: IntegrationFactKind;
  amountPaise: number;
  assetId?: string | null;
  liabilityId?: string | null;
  businessId?: string | null;
  metadataJson?: Record<string, unknown>;
};

export async function upsertIntegrationFact(input: IntegrationFactInput) {
  const existing = await ownerDb
    .select({ id: ooIntegrationFacts.id })
    .from(ooIntegrationFacts)
    .where(
      and(
        eq(ooIntegrationFacts.sourceSystem, input.sourceSystem),
        eq(ooIntegrationFacts.externalRef, input.externalRef),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = await ownerDb
      .update(ooIntegrationFacts)
      .set({
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        kind: input.kind,
        amountPaise: input.amountPaise,
        assetId: input.assetId ?? null,
        liabilityId: input.liabilityId ?? null,
        businessId: input.businessId ?? null,
        metadataJson: input.metadataJson ?? {},
        syncedAt: new Date(),
      })
      .where(eq(ooIntegrationFacts.id, existing[0].id))
      .returning();
    return { row, created: false };
  }

  const [row] = await ownerDb
    .insert(ooIntegrationFacts)
    .values({
      sourceSystem: input.sourceSystem,
      externalRef: input.externalRef,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      kind: input.kind,
      amountPaise: input.amountPaise,
      assetId: input.assetId ?? null,
      liabilityId: input.liabilityId ?? null,
      businessId: input.businessId ?? null,
      metadataJson: input.metadataJson ?? {},
    })
    .returning();

  return { row, created: true };
}

export async function listIntegrationFacts(opts?: {
  sourceSystem?: SourceSystem;
  kind?: IntegrationFactKind;
  limit?: number;
}) {
  const conditions = [];
  if (opts?.sourceSystem) conditions.push(eq(ooIntegrationFacts.sourceSystem, opts.sourceSystem));
  if (opts?.kind) conditions.push(eq(ooIntegrationFacts.kind, opts.kind));

  const query = ownerDb.select().from(ooIntegrationFacts).orderBy(ooIntegrationFacts.syncedAt);
  if (conditions.length > 0) {
    return query.where(and(...conditions)).limit(opts?.limit ?? 100);
  }
  return query.limit(opts?.limit ?? 100);
}

export type SyncResult = {
  sourceSystem: SourceSystem;
  factsUpserted: number;
  errors: string[];
};

export async function syncAllEngineFacts(month?: string): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  const pgResult = await syncPgFacts(month);
  results.push(pgResult);

  const fyhResult = await syncFyhFacts(month);
  results.push(fyhResult);

  const capitalResult = await syncCapitalFacts(month);
  results.push(capitalResult);

  return results;
}

export async function syncPgFacts(month?: string): Promise<SyncResult> {
  const errors: string[] = [];
  let factsUpserted = 0;

  try {
    const { getOwnerFinancialSummary } = await import(
      '@/src/services/ownerFinancialSummary'
    );
    const summary = await getOwnerFinancialSummary({ month });
    const periodStart = summary.periodStart;
    const periodEnd = summary.periodEnd;

    const ecosystemFacts: IntegrationFactInput[] = [
      {
        sourceSystem: 'AWESOME_PG',
        externalRef: `awesome_pg:revenue:${periodStart}:${periodEnd}`,
        periodStart,
        periodEnd,
        kind: 'REVENUE',
        amountPaise: summary.revenuePaise,
      },
      {
        sourceSystem: 'AWESOME_PG',
        externalRef: `awesome_pg:expense:${periodStart}:${periodEnd}`,
        periodStart,
        periodEnd,
        kind: 'EXPENSE',
        amountPaise: summary.expensePaise,
      },
      {
        sourceSystem: 'AWESOME_PG',
        externalRef: `awesome_pg:profit:${periodStart}:${periodEnd}`,
        periodStart,
        periodEnd,
        kind: 'PROFIT',
        amountPaise: summary.profitPaise,
      },
    ];

    for (const fact of ecosystemFacts) {
      await upsertIntegrationFact(fact);
      factsUpserted += 1;
    }

    const { getPgFinancialMetrics } = await import('@/src/services/financialMetricsEngine');
    const pgMetrics = await getPgFinancialMetrics(month);
    const { findAssetIdForPg } = await import('@/src/owner/services/propertyFinancials');

    for (const pg of pgMetrics) {
      const assetId = await findAssetIdForPg(pg.pgId);
      if (!assetId) continue;

      const pgFacts: IntegrationFactInput[] = [
        {
          sourceSystem: 'AWESOME_PG',
          externalRef: `awesome_pg:pg:${pg.pgId}:revenue:${periodStart}:${periodEnd}`,
          periodStart,
          periodEnd,
          kind: 'REVENUE',
          amountPaise: pg.operatingRevenuePaise,
          assetId,
          metadataJson: { pgId: pg.pgId, pgName: pg.pgName },
        },
        {
          sourceSystem: 'AWESOME_PG',
          externalRef: `awesome_pg:pg:${pg.pgId}:profit:${periodStart}:${periodEnd}`,
          periodStart,
          periodEnd,
          kind: 'PROFIT',
          amountPaise: pg.operatingRevenuePaise,
          assetId,
          metadataJson: { pgId: pg.pgId, pgName: pg.pgName },
        },
      ];

      for (const fact of pgFacts) {
        await upsertIntegrationFact(fact);
        factsUpserted += 1;
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'PG sync failed');
  }

  return { sourceSystem: 'AWESOME_PG', factsUpserted, errors };
}

export async function syncFyhFacts(month?: string): Promise<SyncResult> {
  const errors: string[] = [];
  let factsUpserted = 0;

  try {
    const { getFyhOwnerFinancialSummary } = await import(
      '@/src/hair/services/ownerFinancialSummary'
    );
    const summary = await getFyhOwnerFinancialSummary({ month });
    const periodStart = summary.periodStart;
    const periodEnd = summary.periodEnd;

    const facts: IntegrationFactInput[] = [
      {
        sourceSystem: 'FYHAIR',
        externalRef: `fyhair:revenue:${periodStart}:${periodEnd}`,
        periodStart,
        periodEnd,
        kind: 'REVENUE',
        amountPaise: summary.revenuePaise,
      },
      {
        sourceSystem: 'FYHAIR',
        externalRef: `fyhair:expense:${periodStart}:${periodEnd}`,
        periodStart,
        periodEnd,
        kind: 'EXPENSE',
        amountPaise: summary.expensePaise,
      },
      {
        sourceSystem: 'FYHAIR',
        externalRef: `fyhair:profit:${periodStart}:${periodEnd}`,
        periodStart,
        periodEnd,
        kind: 'PROFIT',
        amountPaise: summary.profitPaise,
      },
    ];

    for (const fact of facts) {
      await upsertIntegrationFact(fact);
      factsUpserted += 1;
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'FYH sync failed');
  }

  return { sourceSystem: 'FYHAIR', factsUpserted, errors };
}

export async function syncCapitalFacts(month?: string): Promise<SyncResult> {
  const errors: string[] = [];
  let factsUpserted = 0;

  try {
    const { getCapitalOwnerWealthSummary } = await import(
      '@/src/capital/services/ownerWealthSummary'
    );
    const summary = await getCapitalOwnerWealthSummary({ month });
    const periodStart = summary.periodStart;
    const periodEnd = summary.periodEnd;

    const facts: IntegrationFactInput[] = [
      {
        sourceSystem: 'CAPITAL',
        externalRef: `capital:revenue:${periodStart}:${periodEnd}`,
        periodStart,
        periodEnd,
        kind: 'REVENUE',
        amountPaise: summary.revenuePaise,
      },
      {
        sourceSystem: 'CAPITAL',
        externalRef: `capital:expense:${periodStart}:${periodEnd}`,
        periodStart,
        periodEnd,
        kind: 'EXPENSE',
        amountPaise: summary.expensePaise,
      },
      {
        sourceSystem: 'CAPITAL',
        externalRef: `capital:profit:${periodStart}:${periodEnd}`,
        periodStart,
        periodEnd,
        kind: 'PROFIT',
        amountPaise: summary.profitPaise,
      },
      {
        sourceSystem: 'CAPITAL',
        externalRef: `capital:asset_value:${periodEnd}`,
        periodStart,
        periodEnd,
        kind: 'ASSET_VALUE',
        amountPaise: summary.portfolioValuePaise,
      },
    ];

    for (const fact of facts) {
      await upsertIntegrationFact(fact);
      factsUpserted += 1;
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Capital sync failed');
  }

  return { sourceSystem: 'CAPITAL', factsUpserted, errors };
}
