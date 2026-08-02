/**
 * Pure helpers — Room OS LedgerProjection (Wave 1).
 */

import type {
  BookingLedgerCategorySlice,
  BookingLedgerSnapshot,
} from '@/src/roomOs/types';

export type LedgerCategoryInput = {
  requiredPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  items: Array<{ status: string }>;
};

export function resolveLedgerCategoryStatus(
  category: LedgerCategoryInput,
): BookingLedgerCategorySlice['status'] {
  if (category.requiredPaise === 0 && category.outstandingPaise === 0) return 'none';
  if (category.outstandingPaise === 0) return 'current';
  if (category.items.some((item) => item.status === 'overdue')) return 'overdue';
  return 'outstanding';
}

export function mapLedgerCategorySlice(category: LedgerCategoryInput): BookingLedgerCategorySlice {
  return {
    requiredPaise: category.requiredPaise,
    receivedPaise: category.paidPaise,
    outstandingPaise: category.outstandingPaise,
    status: resolveLedgerCategoryStatus(category),
  };
}

const TERMINAL_CHECKOUT_STATUSES = new Set(['completed', 'archived']);

export function resolvePaymentState(input: {
  bookingStatus: string;
  pendingProofCount: number;
  checkoutSettlementStatus: string | null;
}): { state: BookingLedgerSnapshot['paymentState']; reason?: string } {
  if (input.pendingProofCount > 0) {
    return { state: 'proof_pending', reason: 'payment_proof_awaiting_review' };
  }
  if (input.bookingStatus === 'pending_payment' || input.bookingStatus === 'pending_approval') {
    return { state: 'proof_pending', reason: input.bookingStatus };
  }
  if (
    input.checkoutSettlementStatus &&
    !TERMINAL_CHECKOUT_STATUSES.has(input.checkoutSettlementStatus)
  ) {
    return { state: 'checkout_open', reason: input.checkoutSettlementStatus };
  }
  return { state: 'clear' };
}
