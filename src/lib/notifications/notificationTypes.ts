/**
 * Notification categories for in-app filters.
 */

export type NotificationCategory =
  | 'bookings'
  | 'payments'
  | 'refunds'
  | 'checkout'
  | 'kyc'
  | 'residents'
  | 'complaints'
  | 'maintenance';

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  bookings: 'Bookings',
  payments: 'Payments',
  refunds: 'Refunds',
  checkout: 'Checkout',
  kyc: 'KYC',
  residents: 'Residents',
  complaints: 'Complaints',
  maintenance: 'Maintenance',
};

/** Maps notification `type` strings to filter categories. */
export const NOTIFICATION_TYPE_CATEGORIES: Record<string, NotificationCategory> = {
  booking_created: 'bookings',
  booking_approved: 'bookings',
  booking_confirmed: 'bookings',
  payment_received: 'payments',
  payment_review: 'payments',
  payment_proof_uploaded: 'payments',
  refund_pending: 'refunds',
  refund_completed: 'refunds',
  deposit_refund_request: 'refunds',
  refund_request_submitted: 'refunds',
  checkout_settlement: 'checkout',
  fixed_stay_checkout_due: 'checkout',
  vacating_alert: 'checkout',
  kyc_pending: 'kyc',
  extension_request: 'residents',
  bed_assignment: 'residents',
  complaint_received: 'complaints',
  maintenance_issue: 'maintenance',
  rent_due: 'bookings',
  electricity_due: 'bookings',
  deposit_collection_due: 'payments',
};

export type NotificationPriority = 'critical' | 'important' | 'informational';

const CRITICAL_TYPES = new Set([
  'booking_created',
  'payment_received',
  'payment_review',
  'payment_proof_uploaded',
  'refund_pending',
  'checkout_settlement',
  'fixed_stay_checkout_due',
]);

const IMPORTANT_TYPES = new Set([
  'kyc_pending',
  'complaint_received',
  'extension_request',
  'vacating_alert',
  'maintenance_issue',
  'deposit_refund_request',
  'refund_request_submitted',
]);

export function priorityForNotificationType(type: string): NotificationPriority {
  if (CRITICAL_TYPES.has(type)) return 'critical';
  if (IMPORTANT_TYPES.has(type)) return 'important';
  return 'informational';
}

export function categoryForNotificationType(type: string): NotificationCategory | null {
  return NOTIFICATION_TYPE_CATEGORIES[type] ?? null;
}
