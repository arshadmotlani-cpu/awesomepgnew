/**
 * Post-approval chrome for Payment Review.
 * Approval stays transactional; this only governs UI after the mutation returns.
 */

export const PAYMENT_REVIEW_APPROVED_TOAST = 'Payment approved';

export type PaymentReviewApprovalPhase = 'idle' | 'mutating' | 'success' | 'error';

export function resolvePaymentReviewApprovalPhase(input: {
  busy: boolean;
  approved: boolean;
  hasError: boolean;
}): PaymentReviewApprovalPhase {
  if (input.approved) return 'success';
  if (input.busy) return 'mutating';
  if (input.hasError) return 'error';
  return 'idle';
}

export type PaymentReviewPostApprovalChrome = {
  /** Full-screen / workspace overlay that captures clicks. Always false. */
  showBlockingOverlay: boolean;
  overlayCapturesPointerEvents: boolean;
  showApprovingSpinner: boolean;
  approveDisabled: boolean;
  rejectDisabled: boolean;
  backToQueueDisabled: boolean;
  /** Admin shell / sidebar must stay clickable. */
  shellNavigationBlocked: boolean;
  allowImmediateRouteChange: boolean;
  callRouterRefreshOnSuccess: boolean;
  awaitQueueRefreshBeforeNavigate: boolean;
  successBannerVisible: boolean;
};

export function paymentReviewPostApprovalChrome(
  phase: PaymentReviewApprovalPhase,
): PaymentReviewPostApprovalChrome {
  const mutating = phase === 'mutating';
  const success = phase === 'success';
  return {
    showBlockingOverlay: false,
    overlayCapturesPointerEvents: false,
    showApprovingSpinner: mutating,
    approveDisabled: mutating || success,
    rejectDisabled: mutating || success,
    backToQueueDisabled: false,
    shellNavigationBlocked: false,
    allowImmediateRouteChange: true,
    callRouterRefreshOnSuccess: false,
    awaitQueueRefreshBeforeNavigate: false,
    successBannerVisible: success,
  };
}
