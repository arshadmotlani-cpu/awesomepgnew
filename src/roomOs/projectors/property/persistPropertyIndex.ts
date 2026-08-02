/**
 * property_os_index persistence — read/write materialized PropertyOsIndexSnapshot rows.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { propertyOsIndex } from '@/src/db/schema/propertyOsIndex';
import type { PropertyOsIndexSnapshot } from '@/src/roomOs/types';
import { firstOfMonth } from '@/src/services/billing';

export type PersistPropertyOsIndexInput = {
  pgId: string;
  billingMonth: string;
  snapshot: PropertyOsIndexSnapshot;
  sourceEventId?: string;
};

export async function loadMaterializedPropertyIndex(input: {
  pgId: string;
  billingMonth: string;
}): Promise<PropertyOsIndexSnapshot | null> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const [row] = await db
    .select({ snapshot: propertyOsIndex.snapshot })
    .from(propertyOsIndex)
    .where(and(eq(propertyOsIndex.pgId, input.pgId), eq(propertyOsIndex.billingMonth, billingMonth)))
    .limit(1);

  return row?.snapshot ?? null;
}

export async function upsertMaterializedPropertyIndex(
  input: PersistPropertyOsIndexInput,
): Promise<PropertyOsIndexSnapshot> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const snapshot = {
    ...input.snapshot,
    pgId: input.pgId,
    billingMonth,
  };

  await db
    .insert(propertyOsIndex)
    .values({
      pgId: input.pgId,
      billingMonth,
      asOf: snapshot.asOf,
      contentHash: snapshot.workQueueSummary.contentHash,
      snapshot,
      snapshotVersion: snapshot.snapshotVersion,
      computedAt: new Date(snapshot.computedAt),
      sourceEventId: input.sourceEventId ?? null,
      materializedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [propertyOsIndex.pgId, propertyOsIndex.billingMonth],
      set: {
        asOf: snapshot.asOf,
        contentHash: snapshot.workQueueSummary.contentHash,
        snapshot,
        snapshotVersion: snapshot.snapshotVersion,
        computedAt: new Date(snapshot.computedAt),
        sourceEventId: input.sourceEventId ?? null,
        materializedAt: new Date(),
      },
    });

  return snapshot;
}
