import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

export function paymentProofWorkflowHref(item: PendingPaymentReviewItem): string {
  return `/admin/operations?filter=payment_proof&key=${encodeURIComponent(item.key)}`;
}

export function kycWorkflowHref(submissionId: string): string {
  return `/admin/residents/kyc/${submissionId}`;
}

export function residentRequestWorkflowHref(requestId: string): string {
  return `/admin/requests?read=${requestId}`;
}

export function bookingWorkflowHref(bookingId: string): string {
  return `/admin/bookings/${bookingId}`;
}

export function vacatingWorkflowHref(vacatingRequestId: string): string {
  return `/admin/vacating?read=${encodeURIComponent(`vacating:${vacatingRequestId}`)}`;
}

export function settlementWorkflowHref(settlementId: string): string {
  return `/admin/checkout-settlements/${settlementId}`;
}

export function bedMapHref(pgId: string): string {
  return `/admin/pgs/${pgId}/map`;
}

/** Resident deposit-refund request status for Command Center display. */
export function refundRequestStatusLabel(status: string): string {
  switch (status) {
    case 'submitted':
      return 'Requested';
    case 'under_review':
      return 'Under Review';
    case 'approved':
      return 'Approved';
    case 'completed':
      return 'Paid';
    case 'rejected':
      return 'Rejected';
    default:
      return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
