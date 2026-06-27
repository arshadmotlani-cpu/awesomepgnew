import type { ActionItem } from '@/src/db/schema/actionItems';
import type { ActionItemMetadata } from '@/src/lib/actionCenter/constants';
import { formatDate } from '@/src/lib/format';

export const CHECKOUT_NOTIFICATION_TYPES = [
  'vacating_alert',
  'fixed_stay_checkout_due',
  'refund_pending',
  'deposit_refund_request',
  'refund_request_submitted',
] as const satisfies readonly ActionItem['type'][];

export type CheckoutNotificationType = (typeof CHECKOUT_NOTIFICATION_TYPES)[number];

export function isCheckoutNotificationType(
  type: ActionItem['type'],
): type is CheckoutNotificationType {
  return (CHECKOUT_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

function formatRoomBed(meta: ActionItemMetadata): string | null {
  const parts: string[] = [];
  if (meta.roomNumber) parts.push(`Room ${meta.roomNumber}`);
  if (meta.bedCode) parts.push(`Bed ${meta.bedCode}`);
  return parts.length > 0 ? parts.join(' • ') : null;
}

function vacatingReason(
  actionTitle: string,
  meta: ActionItemMetadata,
  dueDate: string | null,
): string {
  if (meta.isPastDue) {
    if (
      actionTitle.includes('complete checkout') ||
      actionTitle.includes('Move-out overdue')
    ) {
      return 'Move-out overdue — complete checkout.';
    }
    return 'Move-out notice expired — approval needed.';
  }
  if (
    actionTitle.includes('Approve move-out') ||
    actionTitle.includes('approve move-out')
  ) {
    return 'Move-out request awaiting approval.';
  }
  if (dueDate) {
    return `Requested move-out on ${formatDate(dueDate)}.`;
  }
  return 'Move-out request awaiting approval.';
}

function checkoutReason(dueDate: string | null): string {
  if (dueDate) return `Fixed stay checkout on ${formatDate(dueDate)}.`;
  return 'Fixed stay checkout due.';
}

function refundReason(
  type: CheckoutNotificationType,
  actionTitle: string,
): string {
  if (type === 'refund_request_submitted') {
    return 'Deposit refund request submitted.';
  }
  if (type === 'deposit_refund_request') {
    return 'Deposit refund awaiting processing.';
  }
  if (type === 'refund_pending') {
    if (actionTitle.includes('overdue')) return 'Deposit refund overdue.';
    return 'Deposit refund pending.';
  }
  return actionTitle;
}

/** Rich push/inbox copy for checkout and move-out notifications. */
export function buildCheckoutNotificationPushContent(
  type: CheckoutNotificationType,
  meta: ActionItemMetadata,
  dueDate: string | null,
  actionTitle: string,
): { title: string; body: string } {
  const lines: string[] = [];
  if (meta.residentName) lines.push(meta.residentName);
  if (meta.pgName) lines.push(meta.pgName);
  const roomBed = formatRoomBed(meta);
  if (roomBed) lines.push(roomBed);

  let title: string;
  let reason: string;

  switch (type) {
    case 'vacating_alert':
      title = 'Move-out Request';
      reason = vacatingReason(actionTitle, meta, dueDate);
      break;
    case 'fixed_stay_checkout_due':
      title = 'Checkout Due';
      reason = checkoutReason(dueDate);
      break;
    case 'refund_pending':
    case 'deposit_refund_request':
    case 'refund_request_submitted':
      title =
        type === 'refund_request_submitted'
          ? 'Refund Request'
          : type === 'deposit_refund_request'
            ? 'Deposit Refund Request'
            : 'Deposit Refund Pending';
      reason = refundReason(type, actionTitle);
      break;
    default:
      title = actionTitle;
      reason = actionTitle;
  }

  lines.push(reason);
  return { title, body: lines.join('\n') };
}
