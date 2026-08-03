/**
 * business_metrics_index persistence — read/write materialized rollup rows.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { businessMetricsIndex } from '@/src/db/schema/businessMetricsIndex';
import type { BusinessMetricsSnapshot } from '@/src/roomOs/types';
import { firstOfMonth } from '@/src/services/billing';

export type PersistBusinessMetricsIndexInput = {
  pgId: string;
  billingMonth: string;
  snapshot: BusinessMetricsSnapshot;
  sourceEventId?: string;
};

export async function loadMaterializedBusinessMetrics(input: {
  pgId: string;
  billingMonth: string;
}): Promise<BusinessMetricsSnapshot | null> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const [row] = await db
    .select({ snapshot: businessMetricsIndex.snapshot })
    .from(businessMetricsIndex)
    .where(and(eq(businessMetricsIndex.pgId, input.pgId), eq(businessMetricsIndex.billingMonth, billingMonth)))
    .limit(1);

  return row?.snapshot ?? null;
}

export async function upsertMaterializedBusinessMetrics(
  input: PersistBusinessMetricsIndexInput,
): Promise<BusinessMetricsSnapshot> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const snapshot = {
    ...input.snapshot,
    pgId: input.pgId,
    billingMonth,
  };

  await db
    .insert(businessMetricsIndex)
    .values({
      pgId: input.pgId,
      billingMonth,
      contentHash: snapshot.contentHash,
      snapshot,
      snapshotVersion: 1,
      computedAt: new Date(snapshot.computedAt),
      sourceEventId: input.sourceEventId ?? null,
      materializedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [businessMetricsIndex.pgId, businessMetricsIndex.billingMonth],
      set: {
        contentHash: snapshot.contentHash,
        snapshot,
        snapshotVersion: 1,
        computedAt: new Date(snapshot.computedAt),
        sourceEventId: input.sourceEventId ?? null,
        materializedAt: new Date(),
      },
    });

  return snapshot;
}
