import type { MoveOutPipelineItem } from '@/src/lib/moveOut/moveOutPipeline';
import { isTerminalVacatingPipelineItem } from '@/src/lib/operations/moveOutAdminAction';
import { isStaleZeroRefundSettlement } from '@/src/lib/residents/checkoutOpsQueueCopy';

export type MoveOutWorkflowStageId =
  | 'pending_request'
  | 'waiting_vacating_date'
  | 'settlement_review'
  | 'refund_ready'
  | 'completed';

export type MoveOutWorkflowWaitingOn = 'admin' | 'resident' | 'none';

export type MoveOutWorkflowStage = {
  id: MoveOutWorkflowStageId;
  label: string;
  nextAction: string;
  requiresAdminAction: boolean;
  waitingOn: MoveOutWorkflowWaitingOn;
};

export type MoveOutWorkflowPresentation = {
  id: MoveOutWorkflowStageId;
  label: string;
  nextAction: string;
  waitingOn: MoveOutWorkflowWaitingOn;
  expectedDate: string | null;
};

export const MOVE_OUT_WORKFLOW_STAGES: Array<{ id: MoveOutWorkflowStageId; label: string }> = [
  { id: 'pending_request', label: 'Pending move-out requests' },
  { id: 'waiting_vacating_date', label: 'Waiting for Vacating Date' },
  { id: 'settlement_review', label: 'Settlement Review' },
  { id: 'refund_ready', label: 'Refund Ready' },
  { id: 'completed', label: 'Completed' },
];

export const WAITING_VACATING_DATE_NEXT_ACTION =
  'Waiting for resident to upload meter photo & UPI.';

/** Permanent resident-facing status lines (post-approval workflow). */
export const RESIDENT_WAITING_METER_UPI_ON_VACATE_DATE =
  'Waiting for you to upload meter photo & UPI QR on your vacating date.';

export const RESIDENT_WAITING_PG_VERIFICATION = 'Waiting for PG verification.';

export const RESIDENT_MOVE_OUT_COMPLETED = 'Completed.';

const STAGE_INDEX: Record<MoveOutWorkflowStageId, number> = {
  pending_request: 0,
  waiting_vacating_date: 1,
  settlement_review: 2,
  refund_ready: 3,
  completed: 4,
};

export function moveOutWorkflowStageIndex(id: MoveOutWorkflowStageId): number {
  return STAGE_INDEX[id];
}

type PipelineLike = Pick<
  MoveOutPipelineItem,
  | 'stage'
  | 'vacatingStatus'
  | 'settlementStatus'
  | 'estimatedRefundPaise'
  | 'nextAction'
>;

function waitingOnForStage(id: MoveOutWorkflowStageId): MoveOutWorkflowWaitingOn {
  if (id === 'pending_request' || id === 'settlement_review' || id === 'refund_ready') {
    return 'admin';
  }
  if (id === 'waiting_vacating_date') return 'resident';
  return 'none';
}

export function deriveMoveOutWorkflowStage(item: PipelineLike): MoveOutWorkflowStage {
  if (item.vacatingStatus === 'pending') {
    const id = 'pending_request' as const;
    return {
      id,
      label: 'Pending move-out requests',
      nextAction: item.nextAction || 'Verify notice period and approve move-out',
      requiresAdminAction: true,
      waitingOn: waitingOnForStage(id),
    };
  }

  if (
    isTerminalVacatingPipelineItem(item) ||
    item.stage === 'bed_released' ||
    item.vacatingStatus === 'rejected'
  ) {
    const id = 'completed' as const;
    return {
      id,
      label: 'Completed',
      nextAction: 'Move-out complete',
      requiresAdminAction: false,
      waitingOn: waitingOnForStage(id),
    };
  }

  if (item.settlementStatus === 'awaiting_admin_review') {
    const id = 'settlement_review' as const;
    return {
      id,
      label: 'Settlement Review',
      nextAction: 'Review electricity and charges, approve refund',
      requiresAdminAction: true,
      waitingOn: waitingOnForStage(id),
    };
  }

  if (
    item.settlementStatus === 'refund_pending' &&
    !isStaleZeroRefundSettlement({
      status: item.settlementStatus,
      finalRefundPaise: item.estimatedRefundPaise,
    })
  ) {
    const id = 'refund_ready' as const;
    return {
      id,
      label: 'Refund Ready',
      nextAction: 'Send refund to resident, then mark paid',
      requiresAdminAction: true,
      waitingOn: waitingOnForStage(id),
    };
  }

  const id = 'waiting_vacating_date' as const;
  return {
    id,
    label: 'Waiting for Vacating Date',
    nextAction: WAITING_VACATING_DATE_NEXT_ACTION,
    requiresAdminAction: false,
    waitingOn: waitingOnForStage(id),
  };
}

export function moveOutWorkflowPresentationFromPipelineLike(
  item: PipelineLike & { vacatingDate?: string },
): MoveOutWorkflowPresentation {
  const stage = deriveMoveOutWorkflowStage(item);
  return {
    id: stage.id,
    label: stage.label,
    nextAction: stage.nextAction,
    waitingOn: stage.waitingOn,
    expectedDate: item.vacatingDate?.slice(0, 10) ?? null,
  };
}

export function moveOutWorkflowWaitingOnLabel(waitingOn: MoveOutWorkflowWaitingOn): string {
  if (waitingOn === 'admin') return 'Waiting on admin';
  if (waitingOn === 'resident') return 'Waiting on resident';
  return 'No action required';
}

export function moveOutWorkflowStageFilterId(
  id: MoveOutWorkflowStageId,
): MoveOutWorkflowStageId | 'all' {
  return id;
}

export type MoveOutWorkflowFilter = MoveOutWorkflowStageId | 'all';

export function moveOutMatchesWorkflowFilter(
  item: PipelineLike,
  filter: MoveOutWorkflowFilter,
): boolean {
  if (filter === 'all') {
    return deriveMoveOutWorkflowStage(item).id !== 'completed';
  }
  return deriveMoveOutWorkflowStage(item).id === filter;
}
