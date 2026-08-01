/**
 * decision/v1/getWorkQueue — reads materialized WorkQueueSnapshot (Wave 1).
 * Wave 0 returns empty stub — never live-composes from legacy services.
 */

import type { WorkQueueBucket, WorkQueueSnapshot } from '@/src/roomOs/types';

export type GetWorkQueueInput = {
  pgId: string;
  billingMonth: string;
  bucket?: WorkQueueBucket;
  cursor?: string;
  limit?: number;
};

export type GetWorkQueueResult = {
  apiVersion: 'decision/v1';
  snapshot: WorkQueueSnapshot | null;
  status: 'not_materialized' | 'ready';
  page: {
    items: WorkQueueSnapshot['items'];
    nextCursor: string | null;
  };
};

export async function getWorkQueue(input: GetWorkQueueInput): Promise<GetWorkQueueResult> {
  return {
    apiVersion: 'decision/v1',
    status: 'not_materialized',
    snapshot: null,
    page: { items: [], nextCursor: null },
  };
}

export async function getWorkQueuePage(
  input: GetWorkQueueInput & { bucket: WorkQueueBucket },
): Promise<GetWorkQueueResult> {
  return getWorkQueue(input);
}

export async function rebuildWorkQueue(_pgId: string, _billingMonth: string): Promise<{ queued: boolean }> {
  return { queued: false };
}
