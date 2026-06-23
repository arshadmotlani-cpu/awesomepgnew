/** Ledger reason prefix — booking checkout overpayment credited to deposit wallet. */
export const BOOKING_OVERPAYMENT_WALLET_CREDIT_PREFIX = 'BOOKING_OVERPAYMENT_WALLET_CREDIT:';

/** Ledger reason prefix — overpayment queued for operator refund. */
export const BOOKING_OVERPAYMENT_REFUND_PENDING_PREFIX = 'BOOKING_OVERPAYMENT_REFUND_PENDING:';

export function bookingOverpaymentWalletCreditReason(bookingCode: string, paymentId: string): string {
  return `${BOOKING_OVERPAYMENT_WALLET_CREDIT_PREFIX} ${bookingCode} · payment ${paymentId.slice(0, 8)}`;
}

export function bookingOverpaymentRefundPendingReason(bookingCode: string, paymentId: string): string {
  return `${BOOKING_OVERPAYMENT_REFUND_PENDING_PREFIX} ${bookingCode} · payment ${paymentId.slice(0, 8)}`;
}
