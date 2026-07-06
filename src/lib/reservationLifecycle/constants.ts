/**
 * Client-safe reservation lifecycle predicates (no env / DB imports).
 */

export type ReservationPhase =
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export const INVENTORY_BLOCKING_BED_RESERVE_STATUSES = ['under_review', 'active'] as const;

export const UNFINISHED_RESERVATION_HEADLINE =
  'You already have an unfinished reservation.';

export function bedReserveHoldBlocksInventory(hold: {
  status: string;
  paymentProofUrl?: string | null;
}): boolean {
  if (hold.status === 'active' || hold.status === 'under_review') return true;
  if (hold.status === 'pending_payment' && Boolean(hold.paymentProofUrl?.trim())) {
    return true;
  }
  return false;
}

export function reservationVisibleToAdmin(phase: ReservationPhase): boolean {
  return phase === 'under_review' || phase === 'approved';
}

export function reservationVisibleToPublic(phase: ReservationPhase): boolean {
  return phase === 'under_review' || phase === 'approved';
}

export function reservationBlocksInventory(phase: ReservationPhase): boolean {
  return phase === 'under_review' || phase === 'approved';
}

export function deriveBedReservePhase(hold: {
  status: string;
  paymentProofUrl?: string | null;
}): ReservationPhase {
  if (hold.status === 'active') return 'approved';
  if (hold.status === 'under_review') return 'under_review';
  if (hold.status === 'cancelled') return 'cancelled';
  if (hold.status === 'expired') return 'expired';
  if (hold.status === 'converted') return 'approved';
  if (hold.status === 'pending_payment' && Boolean(hold.paymentProofUrl?.trim())) {
    return 'under_review';
  }
  if (hold.status === 'pending_payment') return 'draft';
  return 'cancelled';
}

export function deriveBookingReservationPhase(input: {
  bookingStatus: string;
  hasBedReservationUnderReview?: boolean;
  hasBedReservationActive?: boolean;
}): ReservationPhase {
  if (input.bookingStatus === 'draft') return 'draft';
  if (input.bookingStatus === 'cancelled') return 'cancelled';
  if (input.bookingStatus === 'confirmed' || input.bookingStatus === 'completed') {
    return 'approved';
  }
  if (input.bookingStatus === 'pending_approval' || input.hasBedReservationUnderReview) {
    return 'under_review';
  }
  if (input.bookingStatus === 'pending_payment') return 'draft';
  return 'cancelled';
}
