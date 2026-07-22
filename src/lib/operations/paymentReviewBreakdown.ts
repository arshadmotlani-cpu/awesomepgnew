/**
 * Admin payment-review breakdown — presentation only (client-safe).
 * Uses precomputed review splits / invoice amounts; never import server services here.
 */
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import {
  detectProofAmountCorruption,
  proofAmountPaiseFromReviewItem,
} from '@/src/lib/operations/paymentReviewProofAmount';

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
  proofAmountCorruptionWarning: string | null;
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

  if (item.kind === 'qr' && item.bookingPaymentReview) {
    const review = item.bookingPaymentReview;
    const rentDue = review.rentDuePaise;
    const depositDue = review.depositCashDuePaise;
    const roomChargesPaid = review.rentPaisePaid;
    const depositPaid = review.depositPaisePaid;
    const depositRemaining = review.depositDuePaise;
    const priorDue = Math.max(
      0,
      review.priorOutstandingDuePaise ??
        item.expectedLines?.find((l) => l.label.toLowerCase().includes('prior'))?.amountPaise ??
        0,
    );
    const allocatedCore = roomChargesPaid + depositPaid;
    const priorPaid = Math.min(priorDue, Math.max(0, proofAmountPaise - allocatedCore));
    const extra = Math.max(0, proofAmountPaise - allocatedCore - priorPaid);
    const totalExpected =
      item.expectedTotalPaise > 0
        ? item.expectedTotalPaise
        : rentDue + depositDue + priorDue;
    const difference = proofAmountPaise - totalExpected;
    const remaining = Math.max(0, totalExpected - proofAmountPaise);
    const proofAmountCorruptionWarning = detectProofAmountCorruption({
      proofAmountPaise,
      rentDuePaise: rentDue,
      depositDuePaise: depositDue,
      expectedCheckoutPaise: totalExpected,
    });

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
      proofAmountCorruptionWarning,
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
    proofAmountCorruptionWarning: null,
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
