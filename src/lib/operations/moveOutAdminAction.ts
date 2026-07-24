/**
 * SSOT: when a move-out / checkout pipeline row requires admin action in Operations now.
 */
import type { MoveOutPipelineItem } from '@/src/lib/moveOut/moveOutPipeline';
import { isStaleZeroRefundSettlement } from '@/src/lib/residents/checkoutOpsQueueCopy';

export function isTerminalVacatingPipelineItem(
  item: Pick<MoveOutPipelineItem, 'stage' | 'vacatingStatus' | 'settlementStatus'>,
): boolean {
  return (
    item.stage === 'bed_released' ||
    item.vacatingStatus === 'completed' ||
    item.vacatingStatus === 'rejected' ||
    item.settlementStatus === 'completed' ||
    item.settlementStatus === 'refund_paid'
  );
}

export function moveOutRequiresAdminActionNow(item: MoveOutPipelineItem): boolean {
  if (isTerminalVacatingPipelineItem(item)) return false;
  if (item.settlementStatus === 'awaiting_resident_details') return false;

  if (item.vacatingStatus === 'pending') return true;

  if (item.settlementStatus === 'awaiting_admin_review') return true;

  if (item.settlementStatus === 'refund_pending') {
    return !isStaleZeroRefundSettlement({
      status: item.settlementStatus,
      finalRefundPaise: item.estimatedRefundPaise,
    });
  }

  return false;
}

/** Client pipeline row (ISO dates) — same action rules as server pipeline. */
export function moveOutClientRequiresAdminActionNow(item: {
  stage: MoveOutPipelineItem['stage'];
  vacatingStatus: MoveOutPipelineItem['vacatingStatus'];
  settlementStatus: MoveOutPipelineItem['settlementStatus'];
  estimatedRefundPaise: number;
}): boolean {
  if (
    item.stage === 'bed_released' ||
    item.vacatingStatus === 'completed' ||
    item.vacatingStatus === 'rejected' ||
    item.settlementStatus === 'completed' ||
    item.settlementStatus === 'refund_paid'
  ) {
    return false;
  }
  return vacatingRowRequiresAdminOpsAction({
    status: item.vacatingStatus,
    settlementStatus: item.settlementStatus,
    finalRefundPaise: item.estimatedRefundPaise,
  });
}

/** Dashboard vacating row (without full pipeline item). */
export function vacatingRowRequiresAdminOpsAction(row: {
  status: string;
  settlementStatus?: string | null;
  finalRefundPaise?: number | null;
}): boolean {
  if (row.status === 'pending') return true;
  if (row.settlementStatus === 'awaiting_resident_details') return false;
  if (row.settlementStatus === 'awaiting_admin_review') return true;
  if (row.settlementStatus === 'refund_pending') {
    return !isStaleZeroRefundSettlement({
      status: row.settlementStatus,
      finalRefundPaise: row.finalRefundPaise ?? null,
    });
  }
  return false;
}

/** Which Operations filter chip this row belongs in, if any. */
export function moveOutOperationsQueueTarget(
  item: MoveOutPipelineItem,
): 'vacating_requests' | 'refund_due' | null {
  if (!moveOutRequiresAdminActionNow(item)) return null;
  if (item.vacatingStatus === 'pending') return 'vacating_requests';
  return 'refund_due';
}
