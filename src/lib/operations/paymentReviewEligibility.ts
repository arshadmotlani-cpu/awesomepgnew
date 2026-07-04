/** Booking statuses that still require admin payment proof review before activation. */
export const BOOKING_AWAITING_PAYMENT_REVIEW_STATUSES = [
  'pending_payment',
  'pending_approval',
  'draft',
] as const;

export type BookingAwaitingPaymentReviewStatus =
  (typeof BOOKING_AWAITING_PAYMENT_REVIEW_STATUSES)[number];

/** True when a booking checkout QR proof should appear in Operations. */
export function isBookingCheckoutEligibleForPaymentReview(
  bookingStatus: string | null | undefined,
): boolean {
  if (!bookingStatus) return true;
  return (BOOKING_AWAITING_PAYMENT_REVIEW_STATUSES as readonly string[]).includes(bookingStatus);
}

/** True when the pg_payment_record row itself is still actionable in Operations. */
export function isPaymentRecordEligibleForReview(
  recordStatus: string | null | undefined,
  hasScreenshot: boolean,
): boolean {
  if (recordStatus !== 'pending') return false;
  return hasScreenshot;
}
