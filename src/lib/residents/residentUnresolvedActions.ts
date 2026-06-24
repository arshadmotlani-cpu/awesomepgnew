/**
 * Single source of truth for unresolved resident actions surfaced in:
 * - Resident profile workflow / primary actions
 * - Operations queue (via matching source queries)
 * - Action items + notifications (sourceKey-aligned)
 *
 * "KYC review required" means a pending kyc_submissions row exists — NOT customers.kyc_status = pending
 * (default for all new accounts).
 */

export type ResidentActionKind =
  | 'kyc_review'
  | 'payment_review'
  | 'bed_assignment'
  | 'checkout';

export type ResidentUnresolvedAction = {
  kind: ResidentActionKind;
  sourceKey: string;
  label: string;
  href: string;
  stateLine?: string;
  nextAction?: string;
};

/** Admin must review uploaded identity documents. */
export function isKycReviewRequired(input: {
  pendingKycSubmissionId: string | null;
}): boolean {
  return Boolean(input.pendingKycSubmissionId);
}

export function buildKycReviewAction(input: {
  customerId: string;
  customerName: string;
  pendingKycSubmissionId: string;
}): ResidentUnresolvedAction {
  return {
    kind: 'kyc_review',
    sourceKey: `kyc:${input.pendingKycSubmissionId}`,
    label: 'Review KYC',
    href: `/admin/residents/kyc/${input.pendingKycSubmissionId}`,
    stateLine: `${input.customerName} — identity review required`,
    nextAction: 'Approve or reject Aadhaar and selfie before bed assignment.',
  };
}

export function kycReviewHref(
  customerId: string,
  pendingKycSubmissionId: string | null | undefined,
): string {
  if (pendingKycSubmissionId) {
    return `/admin/residents/kyc/${pendingKycSubmissionId}`;
  }
  return `/admin/residents/kyc?customer=${customerId}`;
}
