/**
 * Operations action-center SSOT — badge counts and queue rows must come from the same item list.
 */
import type { OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import { OPS_QUEUE_FILTERS, OPS_QUEUE_LABELS } from '@/src/lib/operations/operationsFilterLinks';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';

export function countOperationsQueueItems(
  items: UnifiedOpsItem[],
): Record<OpsQueueFilter, number> {
  const counts = Object.fromEntries(OPS_QUEUE_FILTERS.map((id) => [id, 0])) as Record<
    OpsQueueFilter,
    number
  >;
  for (const item of items) {
    counts[item.queue] += 1;
  }
  return counts;
}

export function filterOperationsQueueItems(
  items: UnifiedOpsItem[],
  filter: OpsQueueFilter,
): UnifiedOpsItem[] {
  return items.filter((item) => item.queue === filter);
}

export function buildOperationsQueueFilterCounts(
  items: UnifiedOpsItem[],
): Array<{ id: OpsQueueFilter; label: string; count: number }> {
  const counts = countOperationsQueueItems(items);
  return OPS_QUEUE_FILTERS.map((id) => ({
    id,
    label: OPS_QUEUE_LABELS[id],
    count: counts[id],
  }));
}

/** Hard invariant — count(queue) === badge for every filter. */
export function assertOperationsQueueParity(
  items: UnifiedOpsItem[],
  counts?: Record<OpsQueueFilter, number>,
): void {
  const byQueue = counts ?? countOperationsQueueItems(items);
  for (const filter of OPS_QUEUE_FILTERS) {
    const visible = filterOperationsQueueItems(items, filter).length;
    if (byQueue[filter] !== visible) {
      throw new Error(
        `Operations queue parity violation for ${filter}: badge=${byQueue[filter]} rows=${visible}`,
      );
    }
  }
}

/** Collapse duplicate domain rows (e.g. refund from pipeline + residents dashboard). */
export function dedupeOperationsQueueItems(items: UnifiedOpsItem[]): UnifiedOpsItem[] {
  const seen = new Set<string>();
  const result: UnifiedOpsItem[] = [];
  for (const item of items) {
    const key =
      item.queue === 'refund_due' && item.bookingId
        ? `refund:${item.bookingId}`
        : item.queue === 'vacating_requests' && item.vacatingRequestId
          ? `vacating:${item.vacatingRequestId}`
          : item.queue === 'waiting_for_approval' && item.paymentReviewKey
            ? `approval:${item.paymentReviewKey}`
            : item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
