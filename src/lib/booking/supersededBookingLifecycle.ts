/**
 * Superseded booking lifecycle — when a newer booking confirms for the same customer
 * at the same PG, older open bookings must not remain in Operations or payment review.
 */

export const OPEN_BOOKING_LIFECYCLE_STATUSES = [
  'draft',
  'pending_payment',
  'pending_approval',
] as const;

export type OpenBookingLifecycleStatus = (typeof OPEN_BOOKING_LIFECYCLE_STATUSES)[number];

export function isOpenBookingLifecycleStatus(status: string): boolean {
  return (OPEN_BOOKING_LIFECYCLE_STATUSES as readonly string[]).includes(status);
}

export function isSupersededBookingStatus(status: string): boolean {
  return status === 'superseded';
}

/** Bookings that must never surface in Operations payment review or booking approval. */
export function isTerminalBookingLifecycleStatus(status: string): boolean {
  return (
    isSupersededBookingStatus(status) ||
    status === 'cancelled' ||
    status === 'completed' ||
    status === 'refunded'
  );
}
