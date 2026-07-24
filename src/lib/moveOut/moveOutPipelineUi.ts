import type { MoveOutPipelineItemClient } from '@/src/lib/moveOut/moveOutPipeline';
import {
  MOVE_OUT_WORKFLOW_STAGES,
  deriveMoveOutWorkflowStage,
  moveOutMatchesWorkflowFilter,
  type MoveOutWorkflowFilter,
  type MoveOutWorkflowStageId,
} from '@/src/lib/moveOut/moveOutWorkflowStages';
import { moveOutClientRequiresAdminActionNow } from '@/src/lib/operations/moveOutAdminAction';

export type { MoveOutWorkflowFilter, MoveOutWorkflowStageId };
export { MOVE_OUT_WORKFLOW_STAGES, deriveMoveOutWorkflowStage, moveOutMatchesWorkflowFilter };

/** @deprecated Use MoveOutWorkflowFilter — kept for gradual migration */
export type MoveOutFilterBucket = MoveOutWorkflowFilter | 'overdue';

export type MoveOutCommandStats = {
  pendingRequest: number;
  waitingVacatingDate: number;
  settlementReview: number;
  refundReady: number;
  completed: number;
  /** Rows requiring admin action now (pending + settlement + refund) */
  needsAction: number;
  activeCount: number;
};

export const MOVE_OUT_WORKFLOW_FILTER_TABS: Array<{
  id: MoveOutWorkflowFilter;
  label: string;
}> = [
  ...MOVE_OUT_WORKFLOW_STAGES.filter((s) => s.id !== 'completed').map((s) => ({
    id: s.id as MoveOutWorkflowFilter,
    label: s.label,
  })),
  { id: 'completed', label: 'Completed' },
];

export function moveOutMatchesFilter(
  item: MoveOutPipelineItemClient,
  filter: MoveOutWorkflowFilter,
): boolean {
  return moveOutMatchesWorkflowFilter(item, filter);
}

function countForWorkflowFilter(
  items: MoveOutPipelineItemClient[],
  filter: MoveOutWorkflowFilter,
): number {
  if (filter === 'all') {
    return items.filter((item) => deriveMoveOutWorkflowStage(item).id !== 'completed').length;
  }
  return items.filter((item) => moveOutMatchesWorkflowFilter(item, filter)).length;
}

export function buildMoveOutCommandStats(items: MoveOutPipelineItemClient[]): MoveOutCommandStats {
  const activeItems = items.filter(
    (item) => deriveMoveOutWorkflowStage(item).id !== 'completed',
  );
  const completedItems = items.filter(
    (item) => deriveMoveOutWorkflowStage(item).id === 'completed',
  );
  return {
    pendingRequest: countForWorkflowFilter(activeItems, 'pending_request'),
    waitingVacatingDate: countForWorkflowFilter(activeItems, 'waiting_vacating_date'),
    settlementReview: countForWorkflowFilter(activeItems, 'settlement_review'),
    refundReady: countForWorkflowFilter(activeItems, 'refund_ready'),
    completed: completedItems.length,
    needsAction: activeItems.filter((item) => moveOutClientRequiresAdminActionNow(item)).length,
    activeCount: activeItems.length,
  };
}

export function moveOutPendingApprovalItems(
  items: MoveOutPipelineItemClient[],
): MoveOutPipelineItemClient[] {
  return items.filter((item) => item.vacatingStatus === 'pending');
}

export function moveOutItemsForWorkflowStage(
  items: MoveOutPipelineItemClient[],
  stageId: MoveOutWorkflowStageId,
): MoveOutPipelineItemClient[] {
  return items.filter((item) => deriveMoveOutWorkflowStage(item).id === stageId);
}

export function moveOutActionableItems(
  items: MoveOutPipelineItemClient[],
): MoveOutPipelineItemClient[] {
  return items.filter((item) => moveOutClientRequiresAdminActionNow(item));
}

export function moveOutPrimaryActionLabel(item: MoveOutPipelineItemClient): string {
  const workflow = deriveMoveOutWorkflowStage(item);
  if (workflow.id === 'pending_request') return 'Approve move-out';
  if (moveOutIsZeroRefundCheckout(item)) return 'Complete checkout';
  if (workflow.id === 'settlement_review') return 'Review settlement';
  if (workflow.id === 'refund_ready') return 'Refund of Deposit';
  if (item.continueKind === 'settlement') return 'Open checkout';
  if (item.continueKind === 'view') return 'View settlement';
  return 'Continue';
}

export function moveOutHeroTitle(item: MoveOutPipelineItemClient): string {
  const workflow = deriveMoveOutWorkflowStage(item);
  if (moveOutIsZeroRefundCheckout(item)) return 'Complete checkout';
  if (workflow.id === 'pending_request') return 'Approve move-out';
  if (workflow.id === 'settlement_review') return 'Settlement Review';
  if (workflow.id === 'refund_ready') return 'Refund Ready';
  if (workflow.id === 'waiting_vacating_date') return workflow.label;
  if (workflow.id === 'completed') return 'Move-out complete';
  return workflow.label;
}

export function moveOutHeroSubtitle(item: MoveOutPipelineItemClient): string {
  if (item.estimatedRefundPaise === 0 && item.continueKind === 'settlement') {
    return 'Deposit fully consumed. No refund due.';
  }
  return deriveMoveOutWorkflowStage(item).nextAction;
}

export function moveOutRequiresActionChip(item: MoveOutPipelineItemClient): boolean {
  return deriveMoveOutWorkflowStage(item).requiresAdminAction;
}

export function moveOutIsZeroRefundCheckout(item: MoveOutPipelineItemClient): boolean {
  return item.estimatedRefundPaise === 0 && item.continueKind === 'settlement';
}

export function moveOutOverdueDays(item: MoveOutPipelineItemClient): number {
  return item.daysRemaining < 0 ? Math.abs(item.daysRemaining) : 0;
}

export function vacatingPipelineHref(stage?: MoveOutWorkflowStageId): string {
  if (!stage) return '/admin/vacating';
  return `/admin/vacating?stage=${stage}`;
}
