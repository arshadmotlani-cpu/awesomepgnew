/**
 * Permanent payment-proof model — transaction ID only.
 *
 * Screenshots are legacy optional artifacts; they must never block submit, review, or approve.
 * Financial amount freeze (`proof_snapshot_*`) is separate from images.
 */

import { normalizeTransactionRef } from '@/src/lib/payments/transactionRefDuplicate';

export const PAYMENT_PROOF_INVARIANTS = {
  required: ['transactionRef', 'amountPaise', 'targetEntity', 'authenticatedContext'] as const,
  notRequired: ['screenshot', 'paymentPhoto', 'imageUrl', 'blobProof'] as const,
  txnPresentIsNotPaid: true,
  adminApprovalRequired: true,
  /** Financial approval requires frozen snapshot paise + txn; never screenshot alone. */
  financialFreezeRequiresTxn: true,
} as const;

export type FrozenFinancialProofInput = {
  proofSnapshotOutstandingPaise?: number | null;
  proofSubmittedAt?: Date | string | null;
  paymentProofTransactionRef?: string | null;
};

/**
 * SSOT: resident proof amounts were frozen at submission and a UPI transaction ID is on file.
 * Screenshot URL is optional legacy evidence — never a prerequisite for approval.
 */
export function hasFrozenFinancialProof(input: FrozenFinancialProofInput): boolean {
  if (
    input.proofSnapshotOutstandingPaise == null ||
    input.proofSnapshotOutstandingPaise < 0 ||
    input.proofSubmittedAt == null
  ) {
    return false;
  }
  return Boolean(normalizeTransactionRef(input.paymentProofTransactionRef));
}

export function paymentProofIncompleteMessage(): string {
  return 'Payment is incomplete — resident must submit a UPI transaction ID.';
}

export function paymentProofFinancialFreezeMissingMessage(): string {
  return 'Payment amounts were not frozen at submission — ask the resident to resubmit their transaction ID.';
}

export function paymentProofTxnOnlyLabel(): string {
  return 'Payment proof: Transaction ID';
}

export function paymentProofScreenshotNotRequiredNote(): string {
  return 'Screenshot not required.';
}
