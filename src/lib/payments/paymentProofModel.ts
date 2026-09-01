/**
 * Permanent payment-proof model — transaction ID only.
 *
 * Screenshots are legacy optional artifacts; they must never block submit, review, or approve.
 * Financial amount freeze (`proof_snapshot_*`) is separate from images.
 */

export const PAYMENT_PROOF_INVARIANTS = {
  required: ['transactionRef', 'amountPaise', 'targetEntity', 'authenticatedContext'] as const,
  notRequired: ['screenshot', 'paymentPhoto', 'imageUrl', 'blobProof'] as const,
  txnPresentIsNotPaid: true,
  adminApprovalRequired: true,
} as const;

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
