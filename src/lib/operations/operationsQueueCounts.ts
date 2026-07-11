/**
 * Operations queue count SSOT — every badge, chip, and dashboard metric must read from
 * `getUnifiedOperationsQueueForRequest` and use helpers here. Never duplicate filters.
 */
import type { OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import type { UnifiedOperationsQueue } from '@/src/services/unifiedOperationsQueue';
import { buildOperationsQueueFilterCounts } from '@/src/lib/operations/operationsQueueDefinition';

export function operationsFilterCount(
  queue: UnifiedOperationsQueue,
  filter: OpsQueueFilter,
): number {
  return queue.filterCounts.find((c) => c.id === filter)?.count ?? 0;
}

/**
 * Total pending Operations actions — sidebar Operations/Overview badges and the
 * Operations page must all use this (queue.totalCount from the unified item list).
 */
export function operationsTotalPendingCount(queue: UnifiedOperationsQueue): number {
  return queue.totalCount;
}

export function operationsFilterCountsRecord(
  queue: UnifiedOperationsQueue,
): Record<OpsQueueFilter, number> {
  return Object.fromEntries(queue.filterCounts.map((c) => [c.id, c.count])) as Record<
    OpsQueueFilter,
    number
  >;
}

/** Visible rows for the active tab — must match the chip badge for that tab. */
export function operationsVisibleRowCount(queue: UnifiedOperationsQueue): number {
  if (queue.filter === 'waiting_for_approval') {
    return queue.paymentReviews.length;
  }
  return queue.items.length;
}

/**
 * Hard invariant for the Operations page — badge count for the active filter must equal
 * visible rows (table rows or payment review list).
 */
export function assertUnifiedOperationsActiveFilterParity(queue: UnifiedOperationsQueue): void {
  const badgeCount = operationsFilterCount(queue, queue.filter);
  const visibleCount = operationsVisibleRowCount(queue);
  if (badgeCount !== visibleCount) {
    throw new Error(
      `Operations active filter parity violation for ${queue.filter}: badge=${badgeCount} visible=${visibleCount}`,
    );
  }
}

/** Recompute chip counts from the canonical item list (never trust stale snapshots). */
export function recomputeOperationsFilterCounts(
  allItems: UnifiedOperationsQueue['items'],
): UnifiedOperationsQueue['filterCounts'] {
  return buildOperationsQueueFilterCounts(allItems);
}
