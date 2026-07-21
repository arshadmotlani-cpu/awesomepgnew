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
import { isStaleZeroRefundSettlement } from '@/src/lib/residents/checkoutOpsQueueCopy';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';
import {
  isDismissedFromOperationsQueue,
  type OperationsQueueDismissalIndex,
} from '@/src/services/operationsQueueDismissals';

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

/** Which Operations queue this pipeline row belongs in, if any. */
export function vacatingOperationsQueueTarget(
  item: MoveOutPipelineItem,
): 'vacating_requests' | 'refund_due' | null {
  if (isTerminalVacatingPipelineItem(item)) return null;

  if (item.settlementStatus === 'awaiting_resident_details') return null;

  if (item.settlementStatus === 'refund_pending') {
    if (
      isStaleZeroRefundSettlement({
        status: item.settlementStatus,
        finalRefundPaise: item.estimatedRefundPaise,
      })
    ) {
      return null;
    }
    return 'refund_due';
  }

  if (item.vacatingStatus === 'pending') return 'vacating_requests';
  if (item.settlementStatus === 'awaiting_admin_review') return 'vacating_requests';
  if (item.continueKind === 'approve') return 'vacating_requests';

  if (item.vacatingStatus === 'approved' && !item.settlementId) return 'vacating_requests';

  if (
    item.estimatedRefundPaise <= 0 &&
    item.continueKind === 'settlement' &&
    item.settlementStatus &&
    item.settlementStatus !== 'completed'
  ) {
    return 'vacating_requests';
  }

  return null;
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

export function mapVacatingPipelineItemToOpsItem(
  item: MoveOutPipelineItem,
  pgId: string | null,
): UnifiedOpsItem | null {
  const queue = vacatingOperationsQueueTarget(item);
  if (!queue) return null;

  const openHref =
    queue === 'refund_due'
      ? bookingFinancialWorkspaceSectionHref(item.bookingId, 'refund')
      : (item.continueHref ?? bookingFinancialWorkspaceHref(item.bookingId));

  const openLabel =
    queue === 'refund_due' ? 'Review finances' : 'Review finances';

  const reason =
    queue === 'refund_due'
      ? 'Settlement approved — refund due'
      : item.vacatingStatus === 'pending'
        ? `Move-out notice · leaves ${item.vacatingDate}`
        : item.nextAction;

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
    reason,
    openHref,
    openLabel,
    category: queue === 'refund_due' ? 'refund' : 'move_out',
    bookingId: item.bookingId,
    vacatingRequestId: item.vacatingRequestId,
    statusLabel: queue === 'refund_due' ? 'Refund due' : undefined,
    amountPaise: queue === 'refund_due' ? item.estimatedRefundPaise : undefined,
  };
}
