/**
 * Approval queue SSOT — counts, snapshots, and booking approval sync helpers.
 *
 * Operations, Overview, Billing metrics, Revenue, notifications, and integrity
 * audits must read payment-proof counts from here.
 */

import type { AdminSession } from '@/src/lib/auth/session';
import type { OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import { operationsFilterCount } from '@/src/lib/operations/operationsQueueCounts';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { getPendingPaymentReviewsForRequest } from '@/src/services/paymentProofQueue';
import {
  getUnifiedOperationsQueueForRequest,
  listPendingBookingApprovalsForSync,
} from '@/src/services/unifiedOperationsQueue';

export type ApprovalQueueSnapshot = {
  /** Canonical pending payment proofs (before dismissals). */
  allPaymentReviews: PendingPaymentReviewItem[];
  /** Visible in Operations after dismissals — same list as approval table. */
  visiblePaymentReviews: PendingPaymentReviewItem[];
  waitingForApprovalCount: number;
  rawPaymentProofCount: number;
  operationsFilterCounts: Array<{ id: OpsQueueFilter; label: string; count: number }>;
  operationsTotalCount: number;
};

export type ApprovalCounts = {
  waitingForApprovalVisible: number;
  rawPaymentProofCount: number;
  operationsTotalCount: number;
  filterCounts: Record<OpsQueueFilter, number>;
};

function filterCountsToRecord(
  counts: ApprovalQueueSnapshot['operationsFilterCounts'],
): Record<OpsQueueFilter, number> {
  return Object.fromEntries(counts.map((c) => [c.id, c.count])) as Record<
    OpsQueueFilter,
    number
  >;
}

export async function loadApprovalQueueSnapshot(
  session: AdminSession,
): Promise<ApprovalQueueSnapshot> {
  const [allPaymentReviews, queue] = await Promise.all([
    getPendingPaymentReviewsForRequest(session),
    getUnifiedOperationsQueueForRequest(session, 'waiting_for_approval'),
  ]);

  const waitingForApprovalCount = operationsFilterCount(queue, 'waiting_for_approval');

  return {
    allPaymentReviews,
    visiblePaymentReviews: queue.paymentReviews,
    waitingForApprovalCount,
    rawPaymentProofCount: allPaymentReviews.length,
    operationsFilterCounts: queue.filterCounts,
    operationsTotalCount: queue.totalCount,
  };
}

export async function loadApprovalCounts(session: AdminSession): Promise<ApprovalCounts> {
  const snapshot = await loadApprovalQueueSnapshot(session);
  return {
    waitingForApprovalVisible: snapshot.waitingForApprovalCount,
    rawPaymentProofCount: snapshot.rawPaymentProofCount,
    operationsTotalCount: snapshot.operationsTotalCount,
    filterCounts: filterCountsToRecord(snapshot.operationsFilterCounts),
  };
}

export async function getWaitingForApprovalCount(session: AdminSession): Promise<number> {
  const queue = await getUnifiedOperationsQueueForRequest(session, 'waiting_for_approval');
  return operationsFilterCount(queue, 'waiting_for_approval');
}

export async function countAllPendingPaymentReviews(session: AdminSession): Promise<number> {
  const items = await getPendingPaymentReviewsForRequest(session);
  return items.length;
}

export async function countVisiblePaymentProofs(session: AdminSession): Promise<number> {
  return getWaitingForApprovalCount(session);
}

export { listPendingBookingApprovalsForSync };
