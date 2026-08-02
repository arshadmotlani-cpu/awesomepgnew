/**
 * Deterministic property index rebuild — orchestrates live projection then persists.
 */

import { extractPropertyIndexRebuildInput } from '@/src/roomOs/projectors/property/extractPropertyIndexRebuildInput';
import { upsertMaterializedPropertyIndex } from '@/src/roomOs/projectors/property/persistPropertyIndex';
import { projectPropertyOsBundle } from '@/src/roomOs/projectors/property/projectPropertyIndex';
import { rebuildWorkQueueIndex } from '@/src/roomOs/projectors/workQueue/rebuildWorkQueueIndex';
import type { RoomOsEventEnvelope, PropertyOsIndexSnapshot } from '@/src/roomOs/types';
import { todayString } from '@/src/lib/dates';
import { appendRoomOsOutboxEntry, type RoomOsDb } from '@/src/roomOs/outbox/append';
import { RULES_CATALOG_V1_ID } from '@/src/roomOs/rules/catalog/v1';
import { firstOfMonth } from '@/src/services/billing';

export type RebuildPropertyOsIndexInput = {
  pgId: string;
  billingMonth?: string;
  asOf?: string;
  sourceEventId?: string;
};

/** Rebuild and upsert property_os_index for one property + billing month. */
export async function rebuildPropertyOsIndex(
  input: RebuildPropertyOsIndexInput,
): Promise<PropertyOsIndexSnapshot | null> {
  const billingMonth = firstOfMonth(input.billingMonth ?? todayString());
  const bundle = await projectPropertyOsBundle({
    pgId: input.pgId,
    billingMonth,
    asOf: input.asOf,
  });
  if (!bundle) return null;

  const snapshot = await upsertMaterializedPropertyIndex({
    pgId: input.pgId,
    billingMonth,
    snapshot: bundle.propertyIndex,
    sourceEventId: input.sourceEventId,
  });

  await rebuildWorkQueueIndex({
    pgId: input.pgId,
    billingMonth,
    sourceEventId: input.sourceEventId,
  });

  return snapshot;
}

/** Outbox handler entry — PropertyProjector registry target. */
export async function materializePropertyIndexFromEvent(
  event: RoomOsEventEnvelope,
): Promise<void> {
  const rebuildInput = extractPropertyIndexRebuildInput(event);
  if (!rebuildInput) return;

  await rebuildPropertyOsIndex({
    pgId: rebuildInput.pgId,
    billingMonth: rebuildInput.billingMonth,
    asOf: rebuildInput.asOf,
    sourceEventId: event.eventId,
  });
}

export async function enqueuePropertyIndexRebuild(
  input: {
    pgId: string;
    billingMonth: string;
    asOf?: string;
    sourceRef?: string;
    rulesEffectivePackId?: string;
  },
  tx?: RoomOsDb,
): Promise<RoomOsEventEnvelope> {
  return appendRoomOsOutboxEntry(
    {
      streamType: 'property',
      streamId: input.pgId,
      eventType: 'property_index.rebuild_requested',
      rulesEffectivePackId: input.rulesEffectivePackId ?? RULES_CATALOG_V1_ID,
      payload: {
        pgId: input.pgId,
        billingMonth: firstOfMonth(input.billingMonth),
        asOf: input.asOf,
      },
      sourceRef: input.sourceRef ?? 'property_index.rebuild',
    },
    tx,
  );
}
