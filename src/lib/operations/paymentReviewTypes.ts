import type { PaymentExplanationView } from '@/src/lib/operations/paymentExplanationView';
import type { PaymentBookingContextView } from '@/src/lib/operations/paymentBookingContextView';
import type { PriorOutstandingItem } from '@/src/lib/billing/bookingCheckoutTotals';
import type { getQrBookingPaymentReview } from '@/src/services/qrPayments';
import type { PriorBookingDepositInfo } from '@/src/services/depositCredit';

export type PaymentReviewExpectedLine = {
  label: string;
  amountPaise: number;
};

import type { PricingLineItem } from '@/src/lib/pricing/types';

export type PaymentReviewBookingDetails = {
  moveInDate: string | null;
  moveOutDate: string | null;
  durationLabel: string | null;
  roomType: string | null;
  bedCode: string | null;
  roomNumber: string | null;
  monthlyRentPaise: number | null;
  depositRequiredPaise: number | null;
  durationMode: string | null;
  stayType: string | null;
  bookingStatus: string | null;
  subtotalPaise: number | null;
  discountPaise: number | null;
  rentDuePaise: number | null;
  rentLineItems?: PricingLineItem[];
  snapshotPricingStrategy?: string | null;
  snapshotPerBedDurationMode?: string | null;
  snapshotPerBedUnits?: number | null;
  depositCreditAppliedPaise?: number;
  depositCreditSourceBookingId?: string | null;
  depositCreditSourceBookingCode?: string | null;
  priorOutstandingItems?: PriorOutstandingItem[];
};

export type OverpaymentDisposition = 'wallet_credit' | 'future_adjustment' | 'refund_later' | 'refund';

export type PendingPaymentReviewItem = {
  key: string;
  kind: 'qr' | 'rent' | 'electricity' | 'extension' | 'deposit_link';
  pgId: string;
  pgName: string;
  residentName: string;
  phone: string | null;
  bookingCode: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  paymentTypeLabel: string;
  title: string;
  subtitle: string;
  amountPaise: number;
  screenshotUrl: string;
  entityId: string;
  customerId: string | null;
  bookingId: string | null;
  expectedLines: PaymentReviewExpectedLine[];
  expectedTotalPaise: number;
  receivedPaise: number | null;
  outstandingAfterApprovalPaise: number;
  overpaidPaise: number;
  outstandingSummary: string | null;
  canPartialApprove: boolean;
  canReject: boolean;
  bookingDetails?: PaymentReviewBookingDetails;
  bookingPaymentReview?: Awaited<ReturnType<typeof getQrBookingPaymentReview>>;
  /** Informational only — prior booking refundable deposits (does not reduce expected due). */
  priorBookingDeposits?: PriorBookingDepositInfo[];
  /** Admin money-trace presentation (no calculation changes). */
  paymentExplanation?: PaymentExplanationView;
  /** Booking + pricing story for admin review (presentation only). */
  bookingContext?: PaymentBookingContextView;
  /** Dedicated approval card fields (rent / electricity). */
  invoiceNumber?: string | null;
  invoiceAmountPaise?: number | null;
  submittedAmountPaise?: number | null;
  referenceNumber?: string | null;
  proofSubmittedAt?: string | null;
  billingMonth?: string | null;
  isPipelineTest?: boolean;
};
