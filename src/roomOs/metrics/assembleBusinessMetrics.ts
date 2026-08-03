/**
 * Combine rollups + deterministic content hash.
 */

import { createHash } from 'node:crypto';
import { todayString } from '@/src/lib/dates';
import { aggregateBookingMetrics } from '@/src/roomOs/metrics/aggregateBookingMetrics';
import { aggregateEventMetrics } from '@/src/roomOs/metrics/aggregateEventMetrics';
import { aggregatePropertyMetrics } from '@/src/roomOs/metrics/aggregatePropertyMetrics';
import { bridgeFinancialMetrics } from '@/src/roomOs/metrics/bridgeFinancialMetrics';
import type { BusinessMetricsSnapshot, PropertyOsIndexSnapshot, WorkQueueSnapshot } from '@/src/roomOs/types';
import { firstOfMonth } from '@/src/services/billing';

export function computeBusinessMetricsContentHash(snapshot: Omit<BusinessMetricsSnapshot, 'contentHash'>): string {
  const canonical = {
    pgId: snapshot.pgId,
    billingMonth: snapshot.billingMonth,
    property: snapshot.property,
    rooms: snapshot.rooms,
    bookings: snapshot.bookings,
    residents: snapshot.residents,
    financial: snapshot.financial,
    eventCounts: snapshot.eventCounts,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export async function assembleBusinessMetrics(input: {
  propertyIndex: PropertyOsIndexSnapshot;
  workQueue?: WorkQueueSnapshot | null;
  asOf?: string;
}): Promise<BusinessMetricsSnapshot> {
  const billingMonth = firstOfMonth(input.propertyIndex.billingMonth);
  const asOf = input.asOf ?? input.propertyIndex.asOf ?? todayString();
  const computedAt = new Date().toISOString();

  const { property, rooms } = aggregatePropertyMetrics(input.propertyIndex);
  const { bookings, residents } = aggregateBookingMetrics({
    propertyIndex: input.propertyIndex,
    workQueue: input.workQueue,
  });

  const [financial, eventCounts] = await Promise.all([
    bridgeFinancialMetrics({ pgId: input.propertyIndex.pgId, billingMonth }),
    aggregateEventMetrics({ pgId: input.propertyIndex.pgId, billingMonth }),
  ]);

  const withoutHash: Omit<BusinessMetricsSnapshot, 'contentHash'> = {
    pgId: input.propertyIndex.pgId,
    billingMonth,
    asOf,
    computedAt,
    property,
    rooms,
    bookings,
    residents,
    financial,
    eventCounts,
    derivationRefs: [
      {
        stepId: 'metrics.property_rollup',
        engine: 'BusinessMetrics',
        inputDigest: `property:${input.propertyIndex.pgId}:${billingMonth}`,
        outputDigest: `proofs:${property.proofsPending}`,
      },
      {
        stepId: 'metrics.financial_bridge',
        engine: 'financialMetricsEngine',
        inputDigest: `pg:${input.propertyIndex.pgId}:${billingMonth}`,
        outputDigest: `operating:${financial.operatingRevenuePaise}`,
      },
    ],
  };

  return {
    ...withoutHash,
    contentHash: computeBusinessMetricsContentHash(withoutHash),
  };
}
