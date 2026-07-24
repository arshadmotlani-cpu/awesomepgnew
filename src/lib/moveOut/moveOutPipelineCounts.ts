import type { MoveOutPipelineItem } from '@/src/lib/moveOut/moveOutPipeline';
import {
  checkoutSettlementPipelineItems,
  monthlyMoveOutApprovalItems,
} from '@/src/lib/moveOut/moveOutPipeline';
import { isWithinDays } from '@/src/lib/operationsCenterRules';

export type MoveOutPipelineCounts = {
  /** Monthly residents awaiting admin approve / reject. */
  moveOutApprovalRequests: number;
  /** @deprecated alias — use moveOutApprovalRequests */
  moveOutNotices: number;
  /** Approved monthly move-outs with vacate date within 30 days. */
  bedsReleasing30Days: number;
  /** Checkout settlements needing resident or admin action. */
  activeCheckoutSettlements: number;
};

/** Derive dashboard counters from pipeline rows — single counting rule. */
export function computeMoveOutPipelineCounts(
  activeItems: MoveOutPipelineItem[],
  today: string,
): MoveOutPipelineCounts {
  const approvalItems = monthlyMoveOutApprovalItems(activeItems);
  const moveOutApprovalRequests = approvalItems.length;
  const bedsReleasing30Days = activeItems.filter(
    (item) =>
      item.workflowKind === 'monthly' &&
      item.vacatingStatus === 'approved' &&
      isWithinDays(item.vacatingDate, today, 30),
  ).length;
  const activeCheckoutSettlements = checkoutSettlementPipelineItems(activeItems).filter(
    (item) =>
      item.settlementStatus === 'awaiting_admin_review' ||
      item.settlementStatus === 'refund_pending',
  ).length;

  return {
    moveOutApprovalRequests,
    moveOutNotices: moveOutApprovalRequests,
    bedsReleasing30Days,
    activeCheckoutSettlements,
  };
}
