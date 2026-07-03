/**
 * Vacating / move-out eligibility for the Operations action center — shared by badges and rows.
 */
import type { MoveOutPipelineItem } from '@/src/lib/moveOut/moveOutPipeline';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import { isStaleZeroRefundSettlement } from '@/src/lib/residents/checkoutOpsQueueCopy';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';

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

export function mapVacatingPipelineItemToOpsItem(
  item: MoveOutPipelineItem,
  pgId: string | null,
): UnifiedOpsItem | null {
  const queue = vacatingOperationsQueueTarget(item);
  if (!queue) return null;

  const openHref =
    queue === 'refund_due'
      ? refundConsoleHref(item.bookingId)
      : item.continueHref ??
        (item.settlementId
          ? `/admin/checkout-settlements/${item.settlementId}`
          : '/admin/vacating?status=pending');

  const openLabel =
    queue === 'refund_due'
      ? 'Review refund'
      : item.continueKind === 'approve'
        ? 'Approve move-out'
        : 'Review';

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
