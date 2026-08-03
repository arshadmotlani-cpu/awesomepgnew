/**
 * Rebuild business metrics from materialized property + work queue indices.
 */

import { loadMaterializedPropertyIndex } from '@/src/roomOs/projectors/property/persistPropertyIndex';
import { loadMaterializedWorkQueue } from '@/src/roomOs/projectors/workQueue/persistWorkQueueIndex';
import { assembleBusinessMetrics } from '@/src/roomOs/metrics/assembleBusinessMetrics';
import { upsertMaterializedBusinessMetrics } from '@/src/roomOs/metrics/persistBusinessMetricsIndex';
import type { BusinessMetricsSnapshot } from '@/src/roomOs/types';
import { todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';

export type RebuildBusinessMetricsIndexInput = {
  pgId: string;
  billingMonth?: string;
  sourceEventId?: string;
  asOf?: string;
};

export async function rebuildBusinessMetricsIndex(
  input: RebuildBusinessMetricsIndexInput,
): Promise<BusinessMetricsSnapshot | null> {
  const billingMonth = firstOfMonth(input.billingMonth ?? todayString());
  const [propertyIndex, workQueue] = await Promise.all([
    loadMaterializedPropertyIndex({ pgId: input.pgId, billingMonth }),
    loadMaterializedWorkQueue({ pgId: input.pgId, billingMonth }),
  ]);

  if (!propertyIndex) return null;

  const snapshot = await assembleBusinessMetrics({
    propertyIndex,
    workQueue,
    asOf: input.asOf,
  });

  return upsertMaterializedBusinessMetrics({
    pgId: input.pgId,
    billingMonth,
    snapshot,
    sourceEventId: input.sourceEventId,
  });
}
