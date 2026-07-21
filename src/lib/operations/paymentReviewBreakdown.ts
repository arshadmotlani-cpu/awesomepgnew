/**
 * Admin payment-review breakdown — presentation only (client-safe).
 * Uses precomputed review splits / invoice amounts; never import server services here.
 */
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

export type PaymentReviewBreakdown = {
  bookingType: string;
  pgName: string;
  roomBed: string;
  stayDuration: string | null;
  roomChargesDuePaise: number;
  securityDepositDuePaise: number;
  priorOutstandingDuePaise: number;
  totalExpectedPaise: number;
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
  if (diff === 0) return 'exact';
  if (diff < 0) return 'short';
  return 'excess';
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

  const bookingType =
    item.bookingContext?.bookingType ??
    (item.lifecycleState === 'reservation_request'
      ? 'Reservation Booking'
      : item.paymentTypeLabel);

  const stayDuration =
    item.bookingContext?.duration ??
    item.bookingDetails?.durationLabel ??
    null;

  const receivedPaise =
    item.submittedAmountPaise ??
    item.receivedPaise ??
    item.amountPaise ??
    0;

  if (item.kind === 'qr' && item.bookingPaymentReview) {
    const review = item.bookingPaymentReview;
    const details = item.bookingDetails;
    // Prefer review splits (already computed from snapshot-aware dues).
    const rentDue = review.rentDuePaise;
    const depositDue = review.depositCashDuePaise;
    const roomChargesPaid = review.rentPaisePaid;
    const depositPaid = review.depositPaisePaid;
    const depositRemaining = review.depositDuePaise;
    const priorDue = Math.max(
      0,
      (details?.priorOutstandingItems ?? []).reduce((s, i) => s + i.amountPaise, 0),
    );
    const allocatedCore = roomChargesPaid + depositPaid;
    const priorPaid = Math.min(priorDue, Math.max(0, receivedPaise - allocatedCore));
    const extra = Math.max(0, receivedPaise - allocatedCore - priorPaid);
    const expectedFromDues = rentDue + depositDue + priorDue;
    const totalExpected =
      item.expectedTotalPaise > 0 ? item.expectedTotalPaise : expectedFromDues;
    const difference = receivedPaise - totalExpected;
    const remaining = Math.max(0, totalExpected - receivedPaise);

    return {
      bookingType:
        item.lifecycleState === 'reservation_request'
          ? 'Reservation Booking'
          : item.bookingContext?.bookingType ?? 'Booking Payment',
      pgName: item.pgName,
      roomBed: roomBed || '—',
      stayDuration,
      roomChargesDuePaise: rentDue,
      securityDepositDuePaise: depositDue,
      priorOutstandingDuePaise: priorDue,
      totalExpectedPaise: totalExpected,
      receivedPaise,
      differencePaise: difference,
      differenceTone: differenceTone(difference),
      statusLabel: 'Awaiting Approval',
      roomChargesPaidPaise: roomChargesPaid,
      depositPaidPaise: depositPaid,
      depositRemainingPaise: depositRemaining,
      priorPaidPaise: priorPaid,
      extraReceivedPaise: extra,
      remainingBalancePaise: remaining,
      paymentCategoryLabel: item.paymentTypeLabel,
    };
  }

  // Rent / electricity / extension / deposit_link
  const totalExpected =
    item.invoiceAmountPaise != null
      ? item.invoiceAmountPaise
      : item.expectedTotalPaise;
  const difference = receivedPaise - totalExpected;
  const isDepositOnly = item.kind === 'deposit_link';
  const roomChargesDue = isDepositOnly ? 0 : totalExpected;
  const depositDue = isDepositOnly ? totalExpected : 0;
  const roomChargesPaid = Math.min(receivedPaise, roomChargesDue);
  const remainder = Math.max(0, receivedPaise - roomChargesPaid);
  const depositPaid = Math.min(remainder, depositDue || (isDepositOnly ? totalExpected : 0));

  return {
    bookingType: item.paymentTypeLabel,
    pgName: item.pgName,
    roomBed: roomBed || '—',
    stayDuration,
    roomChargesDuePaise: roomChargesDue,
    securityDepositDuePaise: depositDue,
    priorOutstandingDuePaise: 0,
    totalExpectedPaise: totalExpected,
    receivedPaise,
    differencePaise: difference,
    differenceTone: differenceTone(difference),
    statusLabel: 'Awaiting Approval',
    roomChargesPaidPaise: roomChargesPaid,
    depositPaidPaise: isDepositOnly ? Math.min(receivedPaise, totalExpected) : depositPaid,
    depositRemainingPaise: isDepositOnly
      ? Math.max(0, totalExpected - receivedPaise)
      : 0,
    priorPaidPaise: 0,
    extraReceivedPaise: Math.max(0, difference),
    remainingBalancePaise: Math.max(0, totalExpected - receivedPaise),
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
    totalAmountReceivedPaise: b.receivedPaise,
    paymentCategoryLabel: b.paymentCategoryLabel,
  };
}

/** Manual allocation UI only when payment cannot be auto-approved with the suggested split. */
export function paymentReviewNeedsManualAllocation(item: PendingPaymentReviewItem): boolean {
  if (item.kind !== 'qr' || !item.bookingId || !item.bookingPaymentReview) {
    return false;
  }
  const breakdown = buildPaymentReviewBreakdown(item);
  if (breakdown.differenceTone !== 'exact') return true;
  if (item.overpaidPaise > 0) return true;
  if (item.bookingPaymentReview.canPartialApprove) return true;
  return false;
}

export function paymentReviewSuggestedAllocation(item: PendingPaymentReviewItem): {
  rentPaise: number;
  depositPaise: number;
} {
  const breakdown = buildPaymentReviewBreakdown(item);
  const review = item.bookingPaymentReview;
  return {
    rentPaise: review?.rentDuePaise ?? breakdown.roomChargesDuePaise,
    depositPaise: review?.depositCashDuePaise ?? breakdown.securityDepositDuePaise,
  };
}
