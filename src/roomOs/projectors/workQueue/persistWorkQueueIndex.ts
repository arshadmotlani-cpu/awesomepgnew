/**
 * work_queue_index persistence — read/write materialized WorkQueueSnapshot rows.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { workQueueIndex } from '@/src/db/schema/workQueueIndex';
import type { WorkQueueSnapshot } from '@/src/roomOs/types';
import { firstOfMonth } from '@/src/services/billing';

export type PersistWorkQueueIndexInput = {
  pgId: string;
  billingMonth: string;
  snapshot: WorkQueueSnapshot;
  sourceEventId?: string;
};

export async function loadMaterializedWorkQueue(input: {
  pgId: string;
  billingMonth: string;
}): Promise<WorkQueueSnapshot | null> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const [row] = await db
    .select({ snapshot: workQueueIndex.snapshot })
    .from(workQueueIndex)
    .where(and(eq(workQueueIndex.pgId, input.pgId), eq(workQueueIndex.billingMonth, billingMonth)))
    .limit(1);

  return row?.snapshot ?? null;
}

export async function upsertMaterializedWorkQueue(
  input: PersistWorkQueueIndexInput,
): Promise<WorkQueueSnapshot> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const snapshot = {
    ...input.snapshot,
    pgId: input.pgId,
    billingMonth,
  };

  await db
    .insert(workQueueIndex)
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
      target: [workQueueIndex.pgId, workQueueIndex.billingMonth],
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
