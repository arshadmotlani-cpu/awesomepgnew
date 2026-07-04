/** How a resident left the PG — drives refund eligibility (not bed assignment). */
export const CHECKOUT_SOURCES = [
  'resident_vacating',
  'admin_force_checkout',
  'resident_checkout',
  'emergency_checkout',
  'system',
] as const;

export type CheckoutSource = (typeof CHECKOUT_SOURCES)[number];

export function isAdminOrForcedCheckout(source: string | null | undefined): boolean {
  return (
    source === 'admin_force_checkout' ||
    source === 'emergency_checkout' ||
    source === 'system'
  );
}

export function isImmediateRefundCheckoutSource(source: string | null | undefined): boolean {
  return (
    source === 'resident_checkout' ||
    isAdminOrForcedCheckout(source)
  );
}

/** Booking has finished stay — refund path may open without a new move-out request. */
export function isBookingLifecycleCheckedOut(input: {
  bookingStatus: string;
  hasActiveBedToday?: boolean;
  checkoutSource?: string | null;
  settlementStatus?: string | null;
}): boolean {
  if (input.bookingStatus === 'completed' || input.bookingStatus === 'cancelled') {
    return true;
  }
  if (input.hasActiveBedToday === false) return true;
  if (isImmediateRefundCheckoutSource(input.checkoutSource)) return true;
  if (
    input.settlementStatus &&
    [
      'awaiting_resident_details',
      'awaiting_admin_review',
      'approved',
      'refund_pending',
      'refund_paid',
      'completed',
    ].includes(input.settlementStatus)
  ) {
    return true;
  }
  return false;
}
