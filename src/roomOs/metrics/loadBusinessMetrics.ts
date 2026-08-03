/**
 * Load business metrics — materialized first, live fallback.
 */

import { loadMaterializedPropertyIndex } from '@/src/roomOs/projectors/property/persistPropertyIndex';
import { loadMaterializedWorkQueue } from '@/src/roomOs/projectors/workQueue/persistWorkQueueIndex';
import { assembleBusinessMetrics } from '@/src/roomOs/metrics/assembleBusinessMetrics';
import { loadMaterializedBusinessMetrics } from '@/src/roomOs/metrics/persistBusinessMetricsIndex';
import type { BusinessMetricsSnapshot, MaterializationStatus } from '@/src/roomOs/types';
import { firstOfMonth } from '@/src/services/billing';

export type LoadBusinessMetricsInput = {
  pgId: string;
  billingMonth: string;
  asOf?: string;
};

export type LoadBusinessMetricsResult = {
  snapshot: BusinessMetricsSnapshot | null;
  status: MaterializationStatus;
};

export async function loadBusinessMetrics(
  input: LoadBusinessMetricsInput,
): Promise<LoadBusinessMetricsResult> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const materialized = await loadMaterializedBusinessMetrics({
    pgId: input.pgId,
    billingMonth,
  });
  if (materialized) {
    return { snapshot: materialized, status: 'ready' };
  }

  const [propertyIndex, workQueue] = await Promise.all([
    loadMaterializedPropertyIndex({ pgId: input.pgId, billingMonth }),
    loadMaterializedWorkQueue({ pgId: input.pgId, billingMonth }),
  ]);

  if (!propertyIndex) {
    return { snapshot: null, status: 'not_materialized' };
  }

  const snapshot = await assembleBusinessMetrics({
    propertyIndex,
    workQueue,
    asOf: input.asOf,
  });

  return { snapshot, status: 'live_fallback' };
}
