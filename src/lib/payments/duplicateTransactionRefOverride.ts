/**
 * Admin override when approving a payment whose transaction ID is already approved elsewhere.
 */

export const DUPLICATE_TXN_REF_OVERRIDE_MIN_REASON_LENGTH = 10;

export type DuplicateTransactionRefOverrideInput = {
  reason: string;
};

export function validateDuplicateTransactionRefOverrideReason(
  reason: string | null | undefined,
): { ok: true; reason: string } | { ok: false; message: string } {
  const trimmed = reason?.trim() ?? '';
  if (trimmed.length < DUPLICATE_TXN_REF_OVERRIDE_MIN_REASON_LENGTH) {
    return {
      ok: false,
      message: `Reason for override must be at least ${DUPLICATE_TXN_REF_OVERRIDE_MIN_REASON_LENGTH} characters.`,
    };
  }
  return { ok: true, reason: trimmed };
}

export type DuplicateTransactionRefReviewContext = {
  /** True when another approved payment already registered this transaction ID. */
  requiresOverride: boolean;
  normalizedRef: string | null;
  /** Approved registry rows for the same ref (excluding current submission). */
  approvedRegistryConflicts: Array<{
    sourceKind: string;
    sourceId: string;
    approvedAt: string | null;
    approvedByAdminId: string | null;
  }>;
  /** Cross-table matches (pending + approved) for admin context. */
  crossMatches: Array<{
    id: string;
    status: string;
    sourceKind?: string;
  }>;
};

export type DuplicateTransactionRefConflictAdminView = {
  sourceKind: string;
  sourceId: string;
  paymentId: string;
  residentName: string | null;
  bookingCode: string | null;
  amountPaise: number | null;
  approvedAt: string | null;
  purposeLabel: string;
};

export type DuplicateTransactionRefReviewContextEnriched =
  DuplicateTransactionRefReviewContext & {
    conflicts: DuplicateTransactionRefConflictAdminView[];
  };

export const DUPLICATE_TXN_REF_WARNING_TITLE = 'Duplicate transaction ID detected';

export function duplicateTransactionRefBlockedMessage(): string {
  return 'This transaction ID is already approved on another payment. Use “Approve anyway” with a reason, or reject this submission.';
}
