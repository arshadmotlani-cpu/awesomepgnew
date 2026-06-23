import type { getQrBookingPaymentReview } from '@/src/services/qrPayments';

export type PaymentReviewExpectedLine = {
  label: string;
  amountPaise: number;
};

export type PaymentReviewBookingDetails = {
  moveInDate: string | null;
  moveOutDate: string | null;
  durationLabel: string | null;
  roomType: string | null;
  bedCode: string | null;
  monthlyRentPaise: number | null;
  depositRequiredPaise: number | null;
};

export type OverpaymentDisposition = 'wallet_credit' | 'future_adjustment' | 'refund_later';

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
};
