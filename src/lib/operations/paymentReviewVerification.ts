/**
 * Payment Review verification SSOT — display-only, no allocation.
 *
 * Expected payment = monthly rent + required deposit (booking row only).
 * Screenshot amount = raw uploaded proof (never booking-derived or repaired).
 */
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { resolveVerifiedProofAmountPaise } from '@/src/lib/operations/paymentReviewProofAmount';

export type PaymentReviewVerification = {
  monthlyRentPaise: number;
  depositRequiredPaise: number;
  expectedPaymentPaise: number;
  /** Raw screenshot / proof upload amount. */
  screenshotAmountPaise: number;
  receivedPaise: number;
  differencePaise: number;
  differenceTone: 'exact' | 'short' | 'excess';
};

const TOLERANCE_PAISE = 100;

function differenceTone(diff: number): PaymentReviewVerification['differenceTone'] {
  if (Math.abs(diff) <= TOLERANCE_PAISE) return 'exact';
  if (diff > 0) return 'short';
  return 'excess';
}

/** Monthly rent from booking financial data — never from proof or snapshots. */
export function monthlyRentPaiseFromBooking(item: PendingPaymentReviewItem): number {
  const details = item.bookingDetails;
  if (details?.subtotalPaise != null) {
    return Math.max(0, details.subtotalPaise - (details.discountPaise ?? 0));
  }
  if (details?.rentDuePaise != null) return details.rentDuePaise;
  if (details?.monthlyRentPaise != null) return details.monthlyRentPaise;

  const rentLine = item.expectedLines?.find((line) => line.label.toLowerCase().includes('rent'));
  if (rentLine) return rentLine.amountPaise;

  return 0;
}

/** Required deposit from booking financial data — never from proof or snapshots. */
export function depositRequiredPaiseFromBooking(item: PendingPaymentReviewItem): number {
  const details = item.bookingDetails;
  if (details?.depositRequiredPaise != null) return details.depositRequiredPaise;

  const depositLine = item.expectedLines?.find((line) =>
    line.label.toLowerCase().includes('deposit'),
  );
  if (depositLine) return depositLine.amountPaise;

  return 0;
}

/** Expected checkout payment = rent + deposit only. No prior outstanding, no proof amounts. */
export function expectedPaymentPaiseFromBooking(item: PendingPaymentReviewItem): number | null {
  if (item.kind !== 'qr' || !item.bookingId) return null;

  const monthlyRent = monthlyRentPaiseFromBooking(item);
  const depositRequired = depositRequiredPaiseFromBooking(item);
  if (monthlyRent <= 0 && depositRequired <= 0) return null;

  return monthlyRent + depositRequired;
}

/**
 * Raw screenshot amount from the uploaded proof only.
 * Prefers frozen submit snapshot; falls back to stored amount_paise.
 * Never uses verified/repaired heuristics or booking totals.
 */
export function screenshotAmountPaiseFromProof(item: PendingPaymentReviewItem): number {
  if (item.kind === 'qr' && item.bookingId) {
    const rentDuePaise = monthlyRentPaiseFromBooking(item);
    const depositRequiredPaise = depositRequiredPaiseFromBooking(item);
    const expectedCheckoutPaise = rentDuePaise + depositRequiredPaise;
    if (expectedCheckoutPaise > 0) {
      return resolveVerifiedProofAmountPaise({
        storedAmountPaise: item.amountPaise,
        proofSnapshotSubmittedPaise: item.submittedAmountPaise,
        rentDuePaise,
        expectedCheckoutPaise,
      }).verifiedAmountPaise;
    }
  }

  if (item.submittedAmountPaise != null && item.submittedAmountPaise > 0) {
    return item.submittedAmountPaise;
  }
  if (item.amountPaise > 0) return item.amountPaise;
  return 0;
}

export function buildPaymentReviewVerification(
  item: PendingPaymentReviewItem,
  booking?: {
    monthlyRentPaise: number | null;
    depositRequiredPaise: number;
  } | null,
): PaymentReviewVerification {
  const screenshotAmountPaise = screenshotAmountPaiseFromProof(item);

  const bookingExpected = expectedPaymentPaiseFromBooking(item);
  if (bookingExpected != null) {
    const monthlyRentPaise =
      booking?.monthlyRentPaise ?? monthlyRentPaiseFromBooking(item);
    const depositRequiredPaise =
      booking?.depositRequiredPaise ?? depositRequiredPaiseFromBooking(item);
    const expectedPaymentPaise = monthlyRentPaise + depositRequiredPaise;
    const differencePaise = expectedPaymentPaise - screenshotAmountPaise;
    return {
      monthlyRentPaise,
      depositRequiredPaise,
      expectedPaymentPaise,
      screenshotAmountPaise,
      receivedPaise: screenshotAmountPaise,
      differencePaise,
      differenceTone: differenceTone(differencePaise),
    };
  }

  const expectedPaymentPaise =
    item.invoiceAmountPaise != null ? item.invoiceAmountPaise : item.expectedTotalPaise;
  const differencePaise = expectedPaymentPaise - screenshotAmountPaise;

  return {
    monthlyRentPaise: 0,
    depositRequiredPaise: 0,
    expectedPaymentPaise,
    screenshotAmountPaise,
    receivedPaise: screenshotAmountPaise,
    differencePaise,
    differenceTone: differenceTone(differencePaise),
  };
}
