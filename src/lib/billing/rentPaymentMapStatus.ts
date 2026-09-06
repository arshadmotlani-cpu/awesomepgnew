/**
 * Rent Payment Map — status classification and click-target SSOT.
 * Uses projectInvoice output; never invents payment state in UI.
 */

import { paymentApprovalDeepLink } from '@/src/lib/approvals/approvalDeepLinks';
import {
  residentBillingInvoiceHref,
  residentProfileHref,
} from '@/src/lib/billing/residentBillingLinks';
import type { RentInvoiceView } from '@/src/services/rentInvoices';

export type RentPaymentMapStatus = 'paid' | 'payment_submitted' | 'not_paid' | 'available';

export const RENT_PAYMENT_MAP_STATUS_LABEL: Record<RentPaymentMapStatus, string> = {
  paid: 'PAID',
  payment_submitted: 'PAYMENT SUBMITTED',
  not_paid: 'NOT PAID',
  available: 'AVAILABLE',
};

export type ClassifyRentPaymentMapBedInput = {
  isOccupiedInMonth: boolean;
  projected?: Pick<RentInvoiceView, 'effectiveStatus' | 'outstandingPaise'> | null;
  hasActiveRejectionWithoutProof?: boolean;
  paymentProofUrl?: string | null;
};

export function classifyRentPaymentMapBed(input: ClassifyRentPaymentMapBedInput): RentPaymentMapStatus {
  if (!input.isOccupiedInMonth) return 'available';

  const projected = input.projected;
  if (projected) {
    if (projected.effectiveStatus === 'paid' || projected.outstandingPaise <= 0) {
      return 'paid';
    }
    if (projected.effectiveStatus === 'payment_in_progress') {
      return 'payment_submitted';
    }
  }

  if (input.hasActiveRejectionWithoutProof && !input.paymentProofUrl) {
    return 'not_paid';
  }

  return 'not_paid';
}

export type RentPaymentMapClickTarget = {
  pgId: string;
  bedId: string;
  customerId?: string | null;
  invoiceId?: string | null;
  status: RentPaymentMapStatus;
};

export function rentPaymentMapBedHref(target: RentPaymentMapClickTarget): string {
  switch (target.status) {
    case 'paid':
      if (target.invoiceId && target.customerId) {
        return residentBillingInvoiceHref(target.invoiceId, target.customerId);
      }
      if (target.invoiceId) return `/admin/invoices/${target.invoiceId}`;
      return `/admin/beds?pgId=${target.pgId}`;
    case 'payment_submitted':
      if (target.invoiceId) return paymentApprovalDeepLink(`rent-${target.invoiceId}`);
      if (target.customerId) return `${residentProfileHref(target.customerId)}#open-bills`;
      return `/admin/beds?pgId=${target.pgId}`;
    case 'not_paid':
      if (target.customerId) return `${residentProfileHref(target.customerId)}#open-bills`;
      return `/admin/beds?pgId=${target.pgId}`;
    case 'available':
    default:
      return `/admin/beds?pgId=${target.pgId}&bedId=${target.bedId}`;
  }
}

export type RentPaymentMapBedLike = { status: RentPaymentMapStatus };

export type RentPaymentMapSummary = {
  totalOccupied: number;
  paid: number;
  paymentSubmitted: number;
  notPaid: number;
  availableBeds: number;
};

export type RentPaymentMapRoomSummary = {
  paid: number;
  submitted: number;
  notPaid: number;
  total: number;
};

export function aggregateRentPaymentMapRoomSummary(
  beds: RentPaymentMapBedLike[],
): RentPaymentMapRoomSummary {
  let paid = 0;
  let submitted = 0;
  let notPaid = 0;
  for (const bed of beds) {
    switch (bed.status) {
      case 'paid':
        paid++;
        break;
      case 'payment_submitted':
        submitted++;
        break;
      case 'not_paid':
        notPaid++;
        break;
      default:
        break;
    }
  }
  return { paid, submitted, notPaid, total: beds.length };
}

export function aggregateRentPaymentMapSummary(beds: RentPaymentMapBedLike[]): RentPaymentMapSummary {
  const roomCounts = aggregateRentPaymentMapRoomSummary(beds);
  let availableBeds = 0;
  for (const bed of beds) {
    if (bed.status === 'available') availableBeds++;
  }
  return {
    totalOccupied: roomCounts.paid + roomCounts.submitted + roomCounts.notPaid,
    paid: roomCounts.paid,
    paymentSubmitted: roomCounts.submitted,
    notPaid: roomCounts.notPaid,
    availableBeds,
  };
}
