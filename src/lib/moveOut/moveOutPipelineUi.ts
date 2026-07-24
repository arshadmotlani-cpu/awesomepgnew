import type { MoveOutPipelineItemClient } from '@/src/lib/moveOut/moveOutPipeline';
import { moveOutClientRequiresAdminActionNow } from '@/src/lib/operations/moveOutAdminAction';

export type MoveOutFilterBucket =
  | 'all'
  | 'needs_action'
  | 'waiting_resident'
  | 'overdue'
  | 'refunds_to_send'
  | 'completed';

export type MoveOutCommandStats = {
  needsAction: number;
  waitingResident: number;
  overdue: number;
  refundsToSend: number;
  completed: number;
  pendingApproval: number;
  activeCount: number;
};

export const MOVE_OUT_FILTER_BUCKETS: Array<{
  id: MoveOutFilterBucket;
  label: string;
}> = [
  { id: 'needs_action', label: 'Needs Action' },
  { id: 'waiting_resident', label: 'Waiting Resident' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'refunds_to_send', label: 'Refunds To Send' },
  { id: 'completed', label: 'Completed' },
];

export function moveOutItemBuckets(item: MoveOutPipelineItemClient): MoveOutFilterBucket[] {
  const buckets: MoveOutFilterBucket[] = [];

  if (item.stage === 'bed_released') {
    buckets.push('completed');
    return buckets;
  }

  if (item.daysRemaining < 0) buckets.push('overdue');

  if (item.settlementStatus === 'awaiting_resident_details') {
    buckets.push('waiting_resident');
  }

  if (
    item.settlementStatus === 'refund_pending' ||
    (item.stage === 'deposit_approved' && item.estimatedRefundPaise > 0)
  ) {
    buckets.push('refunds_to_send');
  }

  if (moveOutClientRequiresAdminActionNow(item)) {
    buckets.push('needs_action');
  }

  return buckets;
}

export function moveOutMatchesFilter(
  item: MoveOutPipelineItemClient,
  filter: MoveOutFilterBucket,
): boolean {
  if (filter === 'all') return true;
  return moveOutItemBuckets(item).includes(filter);
}

function countForMoveOutFilter(
  items: MoveOutPipelineItemClient[],
  filter: MoveOutFilterBucket,
): number {
  if (filter === 'all') {
    return items.filter((item) => item.stage !== 'bed_released').length;
  }
  return items.filter((item) => moveOutMatchesFilter(item, filter)).length;
}

export function buildMoveOutCommandStats(items: MoveOutPipelineItemClient[]): MoveOutCommandStats {
  const activeItems = items.filter((item) => item.stage !== 'bed_released');
  return {
    needsAction: countForMoveOutFilter(activeItems, 'needs_action'),
    waitingResident: countForMoveOutFilter(activeItems, 'waiting_resident'),
    overdue: countForMoveOutFilter(activeItems, 'overdue'),
    refundsToSend: countForMoveOutFilter(activeItems, 'refunds_to_send'),
    completed: countForMoveOutFilter(items, 'completed'),
    pendingApproval: moveOutPendingApprovalItems(activeItems).length,
    activeCount: activeItems.length,
  };
}

export function moveOutPendingApprovalItems(
  items: MoveOutPipelineItemClient[],
): MoveOutPipelineItemClient[] {
  return items.filter((item) => item.vacatingStatus === 'pending');
}

export function moveOutPrimaryActionLabel(item: MoveOutPipelineItemClient): string {
  if (item.continueKind === 'approve') return 'Approve move-out';
  if (moveOutIsZeroRefundCheckout(item)) return 'Complete checkout';
  if (item.settlementStatus === 'awaiting_admin_review') return 'Review settlement';
  if (item.settlementStatus === 'refund_pending') return 'Refund of Deposit';
  if (item.continueKind === 'settlement') return 'Open checkout';
  if (item.continueKind === 'view') return 'View settlement';
  return 'Continue';
}

export function moveOutHeroTitle(item: MoveOutPipelineItemClient): string {
  if (moveOutIsZeroRefundCheckout(item)) return 'Complete checkout';
  if (item.continueKind === 'approve') return 'Approve move-out';
  if (item.settlementStatus === 'awaiting_admin_review') return 'Review settlement';
  if (item.settlementStatus === 'refund_pending') return 'Refund of Deposit';
  if (item.settlementStatus === 'awaiting_resident_details') return 'Waiting for resident';
  if (item.stage === 'bed_released') return 'Move-out complete';
  return item.stageLabel;
}

export function moveOutHeroSubtitle(item: MoveOutPipelineItemClient): string {
  if (item.estimatedRefundPaise === 0 && item.continueKind === 'settlement') {
    return 'Deposit fully consumed. No refund due.';
  }
  return item.nextAction;
}

export function moveOutIsZeroRefundCheckout(item: MoveOutPipelineItemClient): boolean {
  return item.estimatedRefundPaise === 0 && item.continueKind === 'settlement';
}

export function moveOutOverdueDays(item: MoveOutPipelineItemClient): number {
  return item.daysRemaining < 0 ? Math.abs(item.daysRemaining) : 0;
}

export function partitionMoveOutItems(items: MoveOutPipelineItemClient[]): {
  overdue: MoveOutPipelineItemClient[];
  active: MoveOutPipelineItemClient[];
} {
  const overdue: MoveOutPipelineItemClient[] = [];
  const active: MoveOutPipelineItemClient[] = [];

  for (const item of items) {
    if (item.daysRemaining < 0 && item.stage !== 'bed_released') {
      overdue.push(item);
    } else {
      active.push(item);
    }
  }

  return { overdue, active };
}
