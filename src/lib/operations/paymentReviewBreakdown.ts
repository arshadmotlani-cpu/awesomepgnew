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
import {
  depositRequiredPaiseFromBooking,
  expectedPaymentPaiseFromBooking,
  monthlyRentPaiseFromBooking,
} from '@/src/lib/operations/paymentReviewVerification';

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

/** SSOT — expected checkout = monthly rent + deposit from booking only (no proof, no prior). */
export function resolveBookingExpectedCheckoutLines(
  item: PendingPaymentReviewItem,
): BookingExpectedCheckoutLines | null {
  const bookingExpected = expectedPaymentPaiseFromBooking(item);
  if (bookingExpected == null) {
    if (item.bookingDetails) {
      const rentDuePaise = monthlyRentPaiseFromBooking(item);
      const depositCashDuePaise = depositRequiredPaiseFromBooking(item);
      if (rentDuePaise > 0 || depositCashDuePaise > 0) {
        return {
          rentDuePaise,
          depositCashDuePaise,
          priorOutstandingPaise: 0,
          checkoutTotalPaise: rentDuePaise + depositCashDuePaise,
        };
      }
    }
    return null;
  }

  const rentDuePaise = monthlyRentPaiseFromBooking(item);
  const depositCashDuePaise = depositRequiredPaiseFromBooking(item);
  return {
    rentDuePaise,
    depositCashDuePaise,
    priorOutstandingPaise: 0,
    checkoutTotalPaise: rentDuePaise + depositCashDuePaise,
  };
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
    const totalExpected = expectedCheckout.checkoutTotalPaise;
    const difference = proofAmountPaise - totalExpected;
    const remaining = Math.max(0, totalExpected - proofAmountPaise);
    const extra = Math.max(0, difference);

    return {
      bookingType,
      pgName: item.pgName,
      roomBed: roomBed || '—',
      stayDuration,
      roomChargesDuePaise: rentDue,
      securityDepositDuePaise: depositDue,
      priorOutstandingDuePaise: 0,
      totalExpectedPaise: totalExpected,
      proofAmountPaise,
      receivedPaise: proofAmountPaise,
      differencePaise: difference,
      differenceTone: differenceTone(difference),
      statusLabel: 'Awaiting review',
      roomChargesPaidPaise: 0,
      depositPaidPaise: 0,
      depositRemainingPaise: depositDue,
      priorPaidPaise: 0,
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

/** @deprecated Payment Review is verification-only — allocation happens in Booking Financial Workspace. */
export function paymentReviewNeedsManualAllocation(_item: PendingPaymentReviewItem): boolean {
  return false;
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
