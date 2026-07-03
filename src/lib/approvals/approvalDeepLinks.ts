/**
 * Approval deep-link SSOT — every surface must use these builders.
 * Operations Waiting for Approval uses `filter=waiting_for_approval&focus={paymentReviewKey}`.
 */

import type { ActionItem } from '@/src/db/schema/actionItems';
import type { ActionItemMetadata } from '@/src/lib/actionCenter/constants';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

/** Open a specific payment proof in Operations → Waiting for approval. */
export function paymentApprovalDeepLink(paymentReviewKey: string): string {
  return operationsFilterHref('waiting_for_approval', paymentReviewKey);
}

export function paymentProofWorkflowHref(item: PendingPaymentReviewItem): string {
  return paymentApprovalDeepLink(item.key);
}

/** Unified deep links for action items and notifications. */
export function buildApprovalDeepLink(
  type: ActionItem['type'],
  meta: ActionItemMetadata,
  residentId: string | null,
): string {
  if (type === 'payment_received' && meta.paymentReviewKey) {
    return paymentApprovalDeepLink(meta.paymentReviewKey);
  }
  if (type === 'vacating_alert' && meta.settlementId) {
    return `/admin/checkout-settlements/${meta.settlementId}?read=${encodeURIComponent(`vacating:${meta.vacatingRequestId ?? ''}`)}`;
  }
  if (type === 'vacating_alert' && meta.vacatingRequestId) {
    return `/admin/vacating?read=${encodeURIComponent(`vacating:${meta.vacatingRequestId}`)}`;
  }
  if (type === 'fixed_stay_checkout_due' && meta.settlementId) {
    return `/admin/checkout-settlements/${meta.settlementId}`;
  }
  if (type === 'kyc_pending' && meta.submissionId) {
    return `/admin/residents/kyc/${meta.submissionId}?read=${encodeURIComponent(`kyc:${meta.submissionId}`)}`;
  }
  if (type === 'refund_pending' && meta.bookingId) {
    return refundConsoleHref(meta.bookingId);
  }
  if (type === 'refund_pending' && meta.settlementId) {
    return '/admin/refunds';
  }
  if (type === 'deposit_refund_request' && meta.bookingId) {
    return refundConsoleHref(meta.bookingId);
  }
  if (type === 'deposit_refund_request' && meta.settlementId) {
    return '/admin/refunds';
  }
  if (type === 'booking_approval' && meta.bookingId) {
    return `/admin/bookings/${meta.bookingId}`;
  }
  if (type === 'rent_due' && meta.bookingId) {
    return `/admin/operations?filter=rent_due`;
  }
  if (type === 'electricity_due' && meta.bookingId) {
    return `/admin/operations?filter=electricity_due`;
  }
  if (type === 'deposit_collection_due' && meta.bookingId) {
    return `/admin/operations?filter=deposit_due`;
  }
  if (type === 'maintenance_issue' && meta.requestId) {
    return `/admin/requests?read=${meta.requestId}`;
  }
  if (type === 'financial_audit_review') {
    if (residentId) return `/admin/residents/${residentId}`;
    return '/admin/operations';
  }
  if (type === 'extension_request' && meta.requestId) {
    return `/admin/requests?read=${encodeURIComponent(meta.requestId)}`;
  }
  if (residentId) {
    return `/admin/residents/${residentId}`;
  }
  return '/admin/operations';
}

/** Normalize notification deep links — never send payment proofs to Billing Centre. */
export function finalizeApprovalNotificationDeepLink(
  type: ActionItem['type'],
  href: string,
  meta?: ActionItemMetadata,
): string {
  if (type === 'payment_received' && meta?.paymentReviewKey) {
    return paymentApprovalDeepLink(meta.paymentReviewKey);
  }
  if (type === 'kyc_pending' && meta?.submissionId) {
    return `/admin/residents/kyc/${meta.submissionId}`;
  }
  if (
    (type === 'refund_pending' || type === 'deposit_refund_request') &&
    meta?.bookingId
  ) {
    return refundConsoleHref(meta.bookingId);
  }
  if (type === 'vacating_alert' && meta?.settlementId) {
    return `/admin/checkout-settlements/${meta.settlementId}`;
  }
  if (type === 'vacating_alert' && meta?.vacatingRequestId) {
    return `/admin/vacating?read=${encodeURIComponent(`vacating:${meta.vacatingRequestId}`)}`;
  }
  if (type === 'fixed_stay_checkout_due' && meta?.settlementId) {
    return `/admin/checkout-settlements/${meta.settlementId}`;
  }
  if (type === 'booking_approval' && meta?.bookingId) {
    return `/admin/bookings/${meta.bookingId}`;
  }
  if (type === 'extension_request' && meta?.requestId) {
    return `/admin/requests?read=${encodeURIComponent(meta.requestId)}`;
  }
  return href;
}

/** Legacy query params from old notification links. */
export function resolveOperationsFocusParam(params: {
  focus?: string | null;
  key?: string | null;
}): string | null {
  const focus = params.focus?.trim();
  if (focus) return focus;
  const key = params.key?.trim();
  if (key) return key;
  return null;
}
