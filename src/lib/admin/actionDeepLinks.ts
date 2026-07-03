import type { ActionItem } from '@/src/db/schema/actionItems';
import type { ActionItemMetadata } from '@/src/lib/actionCenter/constants';
import {
  buildApprovalDeepLink,
  paymentApprovalDeepLink,
} from '@/src/lib/approvals/approvalDeepLinks';

/**
 * @deprecated Use buildApprovalDeepLink from approvalDeepLinks.ts
 */
export function buildActionDeepLink(
  type: ActionItem['type'],
  meta: ActionItemMetadata,
  residentId: string | null,
): string {
  return buildApprovalDeepLink(type, meta, residentId);
}

export { paymentApprovalDeepLink };

export function buildNotificationReadParam(type: ActionItem['type'], meta: ActionItemMetadata): string | null {
  if (type === 'vacating_alert' && meta.vacatingRequestId) {
    return `vacating:${meta.vacatingRequestId}`;
  }
  if (type === 'kyc_pending' && meta.submissionId) {
    return `kyc:${meta.submissionId}`;
  }
  return null;
}
