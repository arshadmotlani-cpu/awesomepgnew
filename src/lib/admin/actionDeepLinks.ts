/**
 * Unified deep links for admin actions — single href builder for notifications and action items.
 */

import type { ActionItem } from '@/src/db/schema/actionItems';
import type { ActionItemMetadata } from '@/src/lib/actionCenter/constants';

export function buildActionDeepLink(
  type: ActionItem['type'],
  meta: ActionItemMetadata,
  residentId: string | null,
): string {
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
  if (type === 'payment_received' && meta.paymentReviewKey) {
    return `/admin/operations/payment-reviews?key=${encodeURIComponent(meta.paymentReviewKey)}`;
  }
  if (type === 'refund_pending' && meta.settlementId) {
    return `/admin/checkout-settlements/${meta.settlementId}`;
  }
  if (type === 'deposit_refund_request' && meta.settlementId) {
    return `/admin/checkout-settlements/${meta.settlementId}`;
  }
  if (type === 'rent_due' && meta.bookingId) {
    return `/admin/billing?tab=rent&booking=${meta.bookingId}`;
  }
  if (type === 'electricity_due' && meta.bookingId) {
    return `/admin/billing?tab=electricity&booking=${meta.bookingId}`;
  }
  if (type === 'deposit_collection_due' && meta.bookingId) {
    return `/admin/deposits?booking=${meta.bookingId}`;
  }
  if (type === 'maintenance_issue' && meta.requestId) {
    return `/admin/requests?read=${meta.requestId}`;
  }
  if (type === 'extension_request' && meta.bookingId) {
    return `/admin/bookings/${meta.bookingId}`;
  }
  if (residentId) {
    return `/admin/residents/${residentId}`;
  }
  return '/admin/operations/residents';
}

export function buildNotificationReadParam(type: ActionItem['type'], meta: ActionItemMetadata): string | null {
  if (type === 'vacating_alert' && meta.vacatingRequestId) {
    return `vacating:${meta.vacatingRequestId}`;
  }
  if (type === 'kyc_pending' && meta.submissionId) {
    return `kyc:${meta.submissionId}`;
  }
  return null;
}
