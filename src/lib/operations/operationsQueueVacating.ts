/**
 * Vacating / move-out eligibility for the Operations action center — shared by badges and rows.
 */
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  bookingFinancialWorkspaceHref,
  bookingFinancialWorkspaceSectionHref,
} from '@/src/lib/bookings/bookingFinancialLinks';
import type { MoveOutPipelineItem } from '@/src/lib/moveOut/moveOutPipeline';
import { deriveMoveOutWorkflowStage } from '@/src/lib/moveOut/moveOutWorkflowStages';
import { moveOutOperationsQueueTarget } from '@/src/lib/operations/moveOutAdminAction';

export { isTerminalVacatingPipelineItem } from '@/src/lib/operations/moveOutAdminAction';

import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';
import {
  isDismissedFromOperationsQueue,
  type OperationsQueueDismissalIndex,
} from '@/src/services/operationsQueueDismissals';

/** Which Operations queue this pipeline row belongs in, if any. */
export function vacatingOperationsQueueTarget(
  item: MoveOutPipelineItem,
): 'vacating_requests' | 'refund_due' | null {
  return moveOutOperationsQueueTarget(item);
}

/** Same visibility rules as `buildUnifiedOperationsQueue` vacating rows (Move-out tab only). */
export function isVacatingPipelineItemVisibleInOperationsQueue(
  item: MoveOutPipelineItem,
  session: AdminSession,
  dismissalIndex: OperationsQueueDismissalIndex,
  pgId: string | null,
): boolean {
  if (vacatingOperationsQueueTarget(item) !== 'vacating_requests') return false;
  if (
    isDismissedFromOperationsQueue(dismissalIndex, {
      customerId: item.customerId,
      bookingId: item.bookingId,
      vacatingRequestId: item.vacatingRequestId,
    })
  ) {
    return false;
  }
  if (pgId && !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId)) {
    return false;
  }
  return true;
}

export function countVacatingOperationsQueueItems(
  activeItems: MoveOutPipelineItem[],
  session: AdminSession,
  dismissalIndex: OperationsQueueDismissalIndex,
  vacatingPgByRequestId: Map<string, string | null>,
): number {
  return activeItems.filter((item) =>
    isVacatingPipelineItemVisibleInOperationsQueue(
      item,
      session,
      dismissalIndex,
      vacatingPgByRequestId.get(item.vacatingRequestId) ?? null,
    ),
  ).length;
}

function moveOutOpsOpenHref(item: MoveOutPipelineItem): string {
  if (item.settlementStatus === 'awaiting_admin_review') {
    return bookingFinancialWorkspaceSectionHref(item.bookingId, 'checkout');
  }
  if (item.settlementStatus === 'refund_pending') {
    return bookingFinancialWorkspaceSectionHref(item.bookingId, 'refund');
  }
  return item.continueHref ?? bookingFinancialWorkspaceHref(item.bookingId);
}

function moveOutOpsReason(item: MoveOutPipelineItem): string {
  const workflow = deriveMoveOutWorkflowStage(item);
  if (workflow.id === 'pending_request') {
    return `Move-out notice · leaves ${item.vacatingDate}`;
  }
  if (workflow.id === 'settlement_review') {
    return 'Action required — settlement review';
  }
  if (workflow.id === 'refund_ready') {
    return 'Action required — refund ready';
  }
  return workflow.nextAction;
}

function moveOutOpsStatusLabel(item: MoveOutPipelineItem): string | undefined {
  const workflow = deriveMoveOutWorkflowStage(item);
  if (workflow.id === 'pending_request') return 'Approve or reject';
  if (workflow.id === 'settlement_review') return 'Action required';
  if (workflow.id === 'refund_ready') return 'Action required';
  return undefined;
}

export function mapVacatingPipelineItemToOpsItem(
  item: MoveOutPipelineItem,
  pgId: string | null,
): UnifiedOpsItem | null {
  const queue = vacatingOperationsQueueTarget(item);
  if (!queue) return null;

  const workflow = deriveMoveOutWorkflowStage(item);

  return {
    id: `moveout-${item.vacatingRequestId}`,
    queue,
    customerId: item.customerId,
    residentName: item.customerFullName,
    residentPhone: item.customerPhone,
    pgId,
    pgName: item.pgName,
    roomNumber: item.roomNumber,
    bedCode: item.bedCode,
    reason: moveOutOpsReason(item),
    openHref: moveOutOpsOpenHref(item),
    openLabel: 'Review finances',
    category: 'move_out',
    bookingId: item.bookingId,
    vacatingRequestId: item.vacatingRequestId,
    statusLabel: moveOutOpsStatusLabel(item),
    amountPaise:
      workflow.id === 'refund_ready' || workflow.id === 'settlement_review'
        ? item.estimatedRefundPaise
        : undefined,
  };
}
