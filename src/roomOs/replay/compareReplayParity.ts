/**
 * Replay parity comparison — dry-run vs materialized snapshot.
 */

import { loadMaterializedPropertyIndex } from '@/src/roomOs/projectors/property/persistPropertyIndex';
import { loadMaterializedWorkQueue } from '@/src/roomOs/projectors/workQueue/persistWorkQueueIndex';
import type { PropertyOsProjectionBundle } from '@/src/roomOs/projectors/property/projectPropertyIndex';
import type { ReplaySampleResult } from '@/src/roomOs/replay/types';
import type { RoomOsEventEnvelope } from '@/src/roomOs/types';
import { firstOfMonth } from '@/src/services/billing';
import { todayString } from '@/src/lib/dates';

function compareKpiStrip(
  dryRun: PropertyOsProjectionBundle['propertyIndex'],
  materialized: NonNullable<Awaited<ReturnType<typeof loadMaterializedPropertyIndex>>>,
): string[] {
  const mismatches: string[] = [];
  const kpiFields = [
    'proofsPending',
    'overdueRent',
    'rentDueToday',
    'electricityIncomplete',
    'moveOutsPending',
  ] as const;
  for (const field of kpiFields) {
    if (dryRun.kpiStrip[field] !== materialized.kpiStrip[field]) {
      mismatches.push(`kpiStrip.${field}: dry=${dryRun.kpiStrip[field]} mat=${materialized.kpiStrip[field]}`);
    }
  }
  return mismatches;
}

export async function compareReplayParity(input: {
  event: RoomOsEventEnvelope;
  dryRun: PropertyOsProjectionBundle;
}): Promise<ReplaySampleResult> {
  const billingMonth = firstOfMonth(
    (input.event.payload?.billingMonth as string | undefined) ?? todayString(),
  );
  const pgId = input.dryRun.propertyIndex.pgId;

  const [materializedProperty, materializedWorkQueue] = await Promise.all([
    loadMaterializedPropertyIndex({ pgId, billingMonth }),
    loadMaterializedWorkQueue({ pgId, billingMonth }),
  ]);

  const mismatches: string[] = [];
  if (!materializedProperty) {
    mismatches.push('materialized property_os_index row missing');
  } else {
    mismatches.push(...compareKpiStrip(input.dryRun.propertyIndex, materializedProperty));
    if (
      input.dryRun.propertyIndex.workQueueSummary.totalItems !==
      materializedProperty.workQueueSummary.totalItems
    ) {
      mismatches.push(
        `workQueueSummary.totalItems: dry=${input.dryRun.propertyIndex.workQueueSummary.totalItems} mat=${materializedProperty.workQueueSummary.totalItems}`,
      );
    }
  }

  const dryRunContentHash = input.dryRun.workQueue.contentHash;
  const materializedContentHash = materializedWorkQueue?.contentHash ?? 'missing';

  if (materializedWorkQueue && dryRunContentHash !== materializedContentHash) {
    mismatches.push(
      `workQueue.contentHash: dry=${dryRunContentHash.slice(0, 16)} mat=${materializedContentHash.slice(0, 16)}`,
    );
  }

  return {
    eventId: input.event.eventId,
    eventType: input.event.eventType,
    sourceRef: input.event.sourceRef,
    matches: mismatches.length === 0,
    mismatches,
    dryRunContentHash,
    materializedContentHash,
  };
}
