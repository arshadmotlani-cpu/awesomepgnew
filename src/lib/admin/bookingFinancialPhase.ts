/**
 * Booking page financial UI phase — checkout ops vs post-check-in history only.
 * Does not change billing calculations; drives which admin widgets render.
 */

export type BookingFinancialPhase =
  | 'checkout'
  | 'active'
  | 'checkout_settlement'
  | 'historical';

type ReservationRow = { kind: string; status: string };

export function getBookingFinancialPhase(args: {
  status: string;
  reservations: ReservationRow[];
  adminDepositRefundStatus: string;
  adminDuesStatus: string;
}): BookingFinancialPhase {
  if (args.status === 'pending_payment') return 'checkout';

  if (args.status === 'cancelled' || args.status === 'completed') {
    return 'historical';
  }

  const primaryActive = args.reservations.some(
    (r) => r.kind === 'primary' && r.status === 'active',
  );

  if (args.status === 'confirmed' && !primaryActive) return 'checkout';

  const inCheckoutSettlement =
    args.adminDepositRefundStatus !== 'unknown' &&
    args.adminDepositRefundStatus !== 'not_applicable';
  const duesTracked = args.adminDuesStatus !== 'unknown';

  if (primaryActive && (inCheckoutSettlement || duesTracked)) {
    return 'checkout_settlement';
  }

  if (primaryActive) return 'active';

  return 'historical';
}

export function showBookingCheckoutFinancialOps(phase: BookingFinancialPhase): boolean {
  return phase === 'checkout';
}

export function showBookingCheckoutOpsPanel(phase: BookingFinancialPhase): boolean {
  return phase === 'checkout_settlement';
}
