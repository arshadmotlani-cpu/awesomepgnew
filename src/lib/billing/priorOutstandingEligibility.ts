/**
 * Which prior stays may contribute collectable outstanding at new booking checkout.
 * Rejected, cancelled, expired, draft, failed, and unpaid-hold bookings are excluded.
 */

export const COLLECTIBLE_PRIOR_BOOKING_STATUSES = ['confirmed', 'completed'] as const;

export const COLLECTIBLE_PRIOR_RESERVATION_STATUSES = ['active', 'completed'] as const;

/** Never carry forward balances from these booking lifecycle states. */
export const EXCLUDED_PRIOR_BOOKING_STATUSES = [
  'draft',
  'pending_payment',
  'pending_approval',
  'superseded',
  'cancelled',
  'refunded',
] as const;

export type CollectiblePriorBookingStatus = (typeof COLLECTIBLE_PRIOR_BOOKING_STATUSES)[number];

export function isCollectiblePriorBookingStatus(status: string): status is CollectiblePriorBookingStatus {
  return (COLLECTIBLE_PRIOR_BOOKING_STATUSES as readonly string[]).includes(status);
}

export function isCollectiblePriorReservationStatus(status: string): boolean {
  return (COLLECTIBLE_PRIOR_RESERVATION_STATUSES as readonly string[]).includes(status);
}

export function isExcludedPriorBookingStatus(status: string): boolean {
  return (EXCLUDED_PRIOR_BOOKING_STATUSES as readonly string[]).includes(status);
}
