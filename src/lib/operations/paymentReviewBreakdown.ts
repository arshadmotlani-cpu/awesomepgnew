/**
 * Admin payment-review breakdown — presentation only (client-safe).
 * Uses precomputed review splits / invoice amounts; never import server services here.
 */
import { breakdownBookingCheckoutPayment } from '@/src/lib/billing/bookingCheckoutTotals';
import type {
  PaymentReviewBookingDetails,
  PendingPaymentReviewItem,
} from '@/src/lib/operations/paymentReviewTypes';
import { proofAmountPaiseFromReviewItem } from '@/src/lib/operations/paymentReviewProofAmount';

export type BookingExpectedCheckoutLines = {
  rentDuePaise: number;
  depositCashDuePaise: number;
  priorOutstandingPaise: number;
  checkoutTotalPaise: number;
};

export function expectedCheckoutFromBookingDetails(
  details: PaymentReviewBookingDetails,
): BookingExpectedCheckoutLines | null {
  if (details.subtotalPaise == null) return null;

  const priorItems = details.priorOutstandingItems ?? [];
  const priorOutstandingPaise = priorItems.reduce((sum, item) => sum + item.amountPaise, 0);
  const breakdown = breakdownBookingCheckoutPayment({
    subtotalPaise: details.subtotalPaise,
    discountPaise: details.discountPaise ?? 0,
    depositPaise: details.depositRequiredPaise ?? 0,
    pricingSnapshot: {
      depositCredit:
        (details.depositCreditAppliedPaise ?? 0) > 0
          ? {
              appliedPaise: details.depositCreditAppliedPaise,
              adminTransferred: true,
            }
          : undefined,
      priorOutstanding:
        priorOutstandingPaise > 0
          ? { totalPaise: priorOutstandingPaise, items: priorItems }
          : undefined,
    },
  });

  return {
    rentDuePaise: breakdown.rentDuePaise,
    depositCashDuePaise: breakdown.depositCashDuePaise,
    priorOutstandingPaise: breakdown.priorOutstandingPaise,
    checkoutTotalPaise: breakdown.bookingTotalDuePaise,
  };
}

/** SSOT — expected checkout lines from booking financial data, never the payment proof amount. */
export function resolveBookingExpectedCheckoutLines(
  item: PendingPaymentReviewItem,
): BookingExpectedCheckoutLines | null {
  const review = item.bookingPaymentReview;
  if (review) {
    const priorOutstandingPaise = Math.max(
      0,
      review.priorOutstandingDuePaise ??
        item.expectedLines?.find((line) => line.label.toLowerCase().includes('prior'))?.amountPaise ??
        0,
    );
    const rentDuePaise = review.rentDuePaise;
    const depositCashDuePaise = review.depositCashDuePaise;
    return {
      rentDuePaise,
      depositCashDuePaise,
      priorOutstandingPaise,
      checkoutTotalPaise: rentDuePaise + depositCashDuePaise + priorOutstandingPaise,
    };
  }

  if (item.bookingDetails) {
    return expectedCheckoutFromBookingDetails(item.bookingDetails);
  }

  return null;
}

export type PaymentReviewBreakdown = {
  bookingType: string;
  pgName: string;
  roomBed: string;
  stayDuration: string | null;
  roomChargesDuePaise: number;
  securityDepositDuePaise: number;
  priorOutstandingDuePaise: number;
  totalExpectedPaise: number;
  /** The single payment proof under review — NOT lifetime received. */
  proofAmountPaise: number;
  /** @deprecated Use proofAmountPaise — kept for queue tables/tests. */
  receivedPaise: number;
  differencePaise: number;
  differenceTone: 'exact' | 'short' | 'excess';
  statusLabel: string;
  roomChargesPaidPaise: number;
  depositPaidPaise: number;
  depositRemainingPaise: number;
  priorPaidPaise: number;
  extraReceivedPaise: number;
  remainingBalancePaise: number;
  paymentCategoryLabel: string;
};

function differenceTone(diff: number): PaymentReviewBreakdown['differenceTone'] {
  if (Math.abs(diff) <= 100) return 'exact';
  if (diff < 0) return 'short';
  return 'excess';
}

function resolveBookingTypeLabel(item: PendingPaymentReviewItem): string {
  return item.bookingContext?.bookingType ?? item.paymentTypeLabel;
}

export function buildPaymentReviewBreakdown(
  item: PendingPaymentReviewItem,
): PaymentReviewBreakdown {
  const roomBed = [
    item.roomNumber ? item.roomNumber : null,
    item.bedCode ? `Bed ${item.bedCode}` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  const bookingType = resolveBookingTypeLabel(item);

  const stayDuration =
    item.bookingContext?.duration ??
    item.bookingDetails?.durationLabel ??
    null;

  const proofAmountPaise = proofAmountPaiseFromReviewItem(item);
  const expectedCheckout = resolveBookingExpectedCheckoutLines(item);

  if (item.kind === 'qr' && expectedCheckout) {
    const rentDue = expectedCheckout.rentDuePaise;
    const depositDue = expectedCheckout.depositCashDuePaise;
    const priorDue = expectedCheckout.priorOutstandingPaise;
    const review = item.bookingPaymentReview;
    const roomChargesPaid = review?.rentPaisePaid ?? 0;
    const depositPaid = review?.depositPaisePaid ?? 0;
    const depositRemaining = review?.depositDuePaise ?? Math.max(0, depositDue - depositPaid);
    const allocatedCore = roomChargesPaid + depositPaid;
    const priorPaid = Math.min(priorDue, Math.max(0, proofAmountPaise - allocatedCore));
    const extra = Math.max(0, proofAmountPaise - allocatedCore - priorPaid);
    const totalExpected = expectedCheckout.checkoutTotalPaise;
    const difference = proofAmountPaise - totalExpected;
    const remaining = Math.max(0, totalExpected - proofAmountPaise);

    return {
      bookingType,
      pgName: item.pgName,
      roomBed: roomBed || '—',
      stayDuration,
      roomChargesDuePaise: rentDue,
      securityDepositDuePaise: depositDue,
      priorOutstandingDuePaise: priorDue,
      totalExpectedPaise: totalExpected,
      proofAmountPaise,
      receivedPaise: proofAmountPaise,
      differencePaise: difference,
      differenceTone: differenceTone(difference),
      statusLabel: 'Awaiting review',
      roomChargesPaidPaise: roomChargesPaid,
      depositPaidPaise: depositPaid,
      depositRemainingPaise: depositRemaining,
      priorPaidPaise: priorPaid,
      extraReceivedPaise: extra,
      remainingBalancePaise: remaining,
      paymentCategoryLabel: item.paymentTypeLabel,
    };
  }

  const totalExpected =
    item.invoiceAmountPaise != null
      ? item.invoiceAmountPaise
      : item.expectedTotalPaise;
  const difference = proofAmountPaise - totalExpected;
  const isDepositOnly = item.kind === 'deposit_link';
  const roomChargesDue = isDepositOnly ? 0 : totalExpected;
  const depositDue = isDepositOnly ? totalExpected : 0;
  const roomChargesPaid = Math.min(proofAmountPaise, roomChargesDue);
  const remainder = Math.max(0, proofAmountPaise - roomChargesPaid);
  const depositPaid = Math.min(remainder, depositDue || (isDepositOnly ? totalExpected : 0));

  return {
    bookingType,
    pgName: item.pgName,
    roomBed: roomBed || '—',
    stayDuration,
    roomChargesDuePaise: roomChargesDue,
    securityDepositDuePaise: depositDue,
    priorOutstandingDuePaise: 0,
    totalExpectedPaise: totalExpected,
    proofAmountPaise,
    receivedPaise: proofAmountPaise,
    differencePaise: difference,
    differenceTone: differenceTone(difference),
    statusLabel: 'Awaiting review',
    roomChargesPaidPaise: roomChargesPaid,
    depositPaidPaise: isDepositOnly ? Math.min(proofAmountPaise, totalExpected) : depositPaid,
    depositRemainingPaise: isDepositOnly
      ? Math.max(0, totalExpected - proofAmountPaise)
      : 0,
    priorPaidPaise: 0,
    extraReceivedPaise: Math.max(0, difference),
    remainingBalancePaise: Math.max(0, totalExpected - proofAmountPaise),
    paymentCategoryLabel: item.paymentTypeLabel,
  };
}

/** Persistable allocation snapshot at approval time (mirrors the admin UI). */
export function allocationSnapshotForApproval(item: PendingPaymentReviewItem): {
  roomChargesPaidPaise: number;
  securityDepositPaidPaise: number;
  totalAmountReceivedPaise: number;
  paymentCategoryLabel: string;
} {
  const b = buildPaymentReviewBreakdown(item);
  return {
    roomChargesPaidPaise: b.roomChargesPaidPaise,
    securityDepositPaidPaise: b.depositPaidPaise,
    totalAmountReceivedPaise: b.proofAmountPaise,
    paymentCategoryLabel: b.paymentCategoryLabel,
  };
}

/** Manual allocation UI only when payment cannot be auto-approved with the suggested split. */
export function paymentReviewNeedsManualAllocation(item: PendingPaymentReviewItem): boolean {
  if (!item.bookingId && item.kind === 'qr') return true;
  if (item.kind === 'qr' && item.bookingPaymentReview) {
    const breakdown = buildPaymentReviewBreakdown(item);
    if (breakdown.differenceTone !== 'exact') return true;
    if (item.bookingPaymentReview.canPartialApprove) return true;
    return false;
  }
  const breakdown = buildPaymentReviewBreakdown(item);
  return breakdown.differenceTone !== 'exact';
}

export function paymentReviewSuggestedAllocation(item: PendingPaymentReviewItem): {
  rentPaise: number;
  depositPaise: number;
  priorOutstandingPaise: number;
  electricityPaise: number;
  otherPaise: number;
} {
  const breakdown = buildPaymentReviewBreakdown(item);
  const review = item.bookingPaymentReview;
  const rentPaise = review?.rentPaisePaid ?? review?.rentDuePaise ?? breakdown.roomChargesDuePaise;
  const depositPaise =
    review?.depositPaisePaid ?? review?.depositCashDuePaise ?? breakdown.securityDepositDuePaise;
  const priorOutstandingPaise = Math.min(
    breakdown.priorOutstandingDuePaise,
    Math.max(0, breakdown.proofAmountPaise - rentPaise - depositPaise),
  );

  if (item.kind === 'electricity') {
    return {
      rentPaise: 0,
      depositPaise: 0,
      priorOutstandingPaise: 0,
      electricityPaise: Math.min(breakdown.proofAmountPaise, breakdown.totalExpectedPaise),
      otherPaise: 0,
    };
  }

  if (item.kind === 'deposit_link') {
    return {
      rentPaise: 0,
      depositPaise: Math.min(breakdown.proofAmountPaise, breakdown.totalExpectedPaise),
      priorOutstandingPaise: 0,
      electricityPaise: 0,
      otherPaise: 0,
    };
  }

  return {
    rentPaise,
    depositPaise,
    priorOutstandingPaise,
    electricityPaise: 0,
    otherPaise: Math.max(
      0,
      breakdown.proofAmountPaise - rentPaise - depositPaise - priorOutstandingPaise,
    ),
  };
}
