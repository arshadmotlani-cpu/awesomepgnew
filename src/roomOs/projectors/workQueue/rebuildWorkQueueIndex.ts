/**
 * Deterministic work queue rebuild — reads Property OS snapshot only, then persists.
 */

import { loadMaterializedPropertyIndex } from '@/src/roomOs/projectors/property/persistPropertyIndex';
import { extractPropertyIndexRebuildInput } from '@/src/roomOs/projectors/property/extractPropertyIndexRebuildInput';
import { upsertMaterializedWorkQueue } from '@/src/roomOs/projectors/workQueue/persistWorkQueueIndex';
import { projectWorkQueueSnapshot } from '@/src/roomOs/projectors/workQueue/projectWorkQueue';
import { rebuildBusinessMetricsIndex } from '@/src/roomOs/metrics/rebuildBusinessMetricsIndex';
import type { RoomOsEventEnvelope, WorkQueueSnapshot } from '@/src/roomOs/types';
import { todayString } from '@/src/lib/dates';
import { appendRoomOsOutboxEntry, type RoomOsDb } from '@/src/roomOs/outbox/append';
import { resolveEffectivePackId } from '@/src/roomOs/rules/store/resolveEffectivePackId';
import { RULES_CATALOG_V1_ID } from '@/src/roomOs/rules/catalog/v1';
import { firstOfMonth } from '@/src/services/billing';

export type RebuildWorkQueueIndexInput = {
  pgId: string;
  billingMonth?: string;
  sourceEventId?: string;
};

/** Rebuild and upsert work_queue_index — input is always property_os_index, never engines. */
export async function rebuildWorkQueueIndex(
  input: RebuildWorkQueueIndexInput,
): Promise<WorkQueueSnapshot | null> {
  const billingMonth = firstOfMonth(input.billingMonth ?? todayString());
  const propertyIndex = await loadMaterializedPropertyIndex({
    pgId: input.pgId,
    billingMonth,
  });
  if (!propertyIndex) return null;

  const snapshot = projectWorkQueueSnapshot({ propertyIndex });

  const workQueue = await upsertMaterializedWorkQueue({
    pgId: input.pgId,
    billingMonth,
    snapshot,
    sourceEventId: input.sourceEventId,
  });

  if (workQueue) {
    await rebuildBusinessMetricsIndex({
      pgId: input.pgId,
      billingMonth,
      sourceEventId: input.sourceEventId,
    });
  }

  return workQueue;
}

/** Outbox handler entry — WorkQueueProjector registry target. */
export async function materializeWorkQueueFromEvent(event: RoomOsEventEnvelope): Promise<void> {
  const rebuildInput = extractPropertyIndexRebuildInput(event);
  if (!rebuildInput) return;

  await rebuildWorkQueueIndex({
    pgId: rebuildInput.pgId,
    billingMonth: rebuildInput.billingMonth,
    sourceEventId: event.eventId,
  });
}

export async function enqueueWorkQueueRebuild(
  input: {
    pgId: string;
    billingMonth: string;
    sourceRef?: string;
    rulesEffectivePackId?: string;
    asOf?: string;
  },
  tx?: RoomOsDb,
): Promise<RoomOsEventEnvelope> {
  const asOf = input.asOf ?? new Date().toISOString();
  let rulesEffectivePackId = input.rulesEffectivePackId;
  if (!rulesEffectivePackId) {
    try {
      rulesEffectivePackId = await resolveEffectivePackId({
        pgId: input.pgId,
        asOf,
      });
    } catch {
      rulesEffectivePackId = RULES_CATALOG_V1_ID;
    }
  }

  return appendRoomOsOutboxEntry(
    {
      streamType: 'property',
      streamId: input.pgId,
      eventType: 'work_queue.rebuilt',
      rulesEffectivePackId,
      payload: {
        pgId: input.pgId,
        billingMonth: firstOfMonth(input.billingMonth),
      },
      sourceRef: input.sourceRef ?? 'work_queue.rebuild',
    },
    tx,
  );
}
