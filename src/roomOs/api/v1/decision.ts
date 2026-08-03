/**
 * decision/v1/getWorkQueue — reads materialized work_queue_index, live fallback.
 */

import { projectPropertyOsBundle } from '@/src/roomOs/projectors/property';
import { loadMaterializedWorkQueue } from '@/src/roomOs/projectors/workQueue/persistWorkQueueIndex';
import { enqueueWorkQueueRebuild } from '@/src/roomOs/projectors/workQueue/rebuildWorkQueueIndex';
import type { MaterializationStatus, WorkQueueBucket, WorkQueueItem, WorkQueueSnapshot } from '@/src/roomOs/types';
import { firstOfMonth } from '@/src/services/billing';

export type GetWorkQueueInput = {
  pgId: string;
  billingMonth: string;
  bucket?: WorkQueueBucket;
  cursor?: string;
  limit?: number;
  asOf?: string;
};

export type GetWorkQueueResult = {
  apiVersion: 'decision/v1';
  snapshot: WorkQueueSnapshot | null;
  status: MaterializationStatus;
  page: {
    items: WorkQueueSnapshot['items'];
    nextCursor: string | null;
  };
};

function paginateWorkQueueItems(
  items: WorkQueueItem[],
  cursor?: string,
  limit = 50,
): { items: WorkQueueItem[]; nextCursor: string | null } {
  const start = cursor ? Number.parseInt(cursor, 10) : 0;
  const safeStart = Number.isFinite(start) && start >= 0 ? start : 0;
  const page = items.slice(safeStart, safeStart + limit);
  const nextCursor = safeStart + limit < items.length ? String(safeStart + limit) : null;
  return { items: page, nextCursor };
}

export async function getWorkQueue(input: GetWorkQueueInput): Promise<GetWorkQueueResult> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const materialized = await loadMaterializedWorkQueue({
    pgId: input.pgId,
    billingMonth,
  });

  const snapshot =
    materialized ??
    (await projectPropertyOsBundle({
      pgId: input.pgId,
      billingMonth: input.billingMonth,
      asOf: input.asOf,
    }))?.workQueue ??
    null;

  if (!snapshot) {
    return {
      apiVersion: 'decision/v1',
      status: 'not_materialized',
      snapshot: null,
      page: { items: [], nextCursor: null },
    };
  }

  const filtered = input.bucket
    ? snapshot.items.filter((item) => item.bucket === input.bucket)
    : snapshot.items;
  const page = paginateWorkQueueItems(filtered, input.cursor, input.limit);

  return {
    apiVersion: 'decision/v1',
    status: materialized ? 'ready' : 'live_fallback',
    snapshot,
    page,
  };
}

export async function getWorkQueuePage(
  input: GetWorkQueueInput & { bucket: WorkQueueBucket },
): Promise<GetWorkQueueResult> {
  return getWorkQueue(input);
}

export async function rebuildWorkQueue(
  pgId: string,
  billingMonth: string,
): Promise<{ queued: boolean }> {
  await enqueueWorkQueueRebuild({ pgId, billingMonth });
  return { queued: true };
}
