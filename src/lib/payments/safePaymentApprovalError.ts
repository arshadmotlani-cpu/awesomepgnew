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

export function userFacingPaymentApprovalError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (raw && SAFE_EXACT.has(raw)) return raw;
  if (raw.startsWith('Proof amount ') || raw.startsWith('Expected amount')) return raw;
  if (raw.includes('already approved on another payment')) {
    return approvedTransactionRefConflictMessage();
  }
  return 'Payment approval could not be completed. No additional money was recorded. Try again, or open Booking financials if the page does not refresh.';
}

export function transactionRefLooksLikeUpiVpa(ref: string | null | undefined): boolean {
  const trimmed = ref?.trim() ?? '';
  return trimmed.includes('@') && trimmed.length >= 3;
}
