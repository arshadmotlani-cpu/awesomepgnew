/**
 * User-facing payment approval errors — never leak SQL, stack traces, or constraint names.
 */

import { approvedTransactionRefConflictMessage } from '@/src/lib/payments/transactionRefDuplicate';

const SAFE_EXACT = new Set([
  approvedTransactionRefConflictMessage(),
  'Payment link not found.',
  'Access denied.',
  'No payment proof uploaded.',
  'This payment link is not awaiting approval.',
  'This deposit link is not awaiting approval.',
  'Transaction ID is required.',
  'Invoice not found.',
  'Invoice is not payable.',
  'Invoice is already paid.',
  'Nothing due on this invoice.',
  'Invalid amount.',
]);

function looksLikeDatabaseConstraintError(raw: string): boolean {
  return (
    /invalid input syntax for type uuid/i.test(raw) ||
    /violates foreign key constraint/i.test(raw) ||
    /\b22P02\b/.test(raw) ||
    /\b23503\b/.test(raw)
  );
}

export function userFacingPaymentApprovalError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (raw && SAFE_EXACT.has(raw)) return raw;
  if (raw.startsWith('Proof amount ') || raw.startsWith('Expected amount')) return raw;
  if (raw.includes('already approved on another payment')) {
    return approvedTransactionRefConflictMessage();
  }
  if (raw) {
    console.error('[payment-approval] unexpected failure', err);
  }
  if (looksLikeDatabaseConstraintError(raw)) {
    return 'Payment could not be recorded. Please try again.';
  }
  return 'Payment approval could not be completed. No additional money was recorded. Try again, or open Booking financials if the page does not refresh.';
}

export function transactionRefLooksLikeUpiVpa(ref: string | null | undefined): boolean {
  const trimmed = ref?.trim() ?? '';
  return trimmed.includes('@') && trimmed.length >= 3;
}
