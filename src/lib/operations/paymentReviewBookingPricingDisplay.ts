/**
 * Payment Review booking pricing labels — presentation only.
 * Amounts come from paymentReviewVerification SSOT; never recalculated here.
 */
import { checkoutWorkflowKind } from '@/src/lib/checkout/checkoutWorkflow';
import { diffDays, parseDate } from '@/src/lib/dates';
import { formatDate, paiseToInr } from '@/src/lib/format';
import {
  formatRentLineLabel,
  rentLineItemsOnly,
} from '@/src/lib/pricing/formatRentLines';
import type { PaymentBookingContextView } from '@/src/lib/operations/paymentBookingContextView';
import type { PaymentReviewBookingDetails } from '@/src/lib/operations/paymentReviewTypes';

export type PaymentReviewPricingRow = {
  label: string;
  value: string;
  detail?: string;
};

export type PaymentReviewBookingPricingDisplay = {
  kind: 'monthly' | 'short_stay';
  rows: PaymentReviewPricingRow[];
};

export function isShortStayPaymentReviewBooking(
  details?: { durationMode?: string | null; stayType?: string | null } | null,
): boolean {
  if (!details) return false;
  return checkoutWorkflowKind(details) === 'fixed_stay';
}

/** Billable stay days — same boundary as booking checkout (`diffDays` on selected dates). */
export function resolvePaymentReviewStayDays(
  moveInDate: string | null | undefined,
  moveOutDate: string | null | undefined,
): number | null {
  if (!moveInDate || !moveOutDate) return null;
  try {
    const days = diffDays(parseDate(moveInDate), parseDate(moveOutDate));
    return days > 0 ? days : null;
  } catch {
    return null;
  }
}

function rentBreakdownDetail(input: {
  bookingDetails?: PaymentReviewBookingDetails | null;
  bookingContext?: PaymentBookingContextView | null;
}): string | undefined {
  const rentLines = rentLineItemsOnly(input.bookingDetails?.rentLineItems ?? []);
  if (rentLines.length === 1) return formatRentLineLabel(rentLines[0]!);
  if (rentLines.length > 1) {
    return rentLines.map((line) => formatRentLineLabel(line)).join(' · ');
  }
  const calc = input.bookingContext?.rentCalculation?.trim();
  return calc && calc.length > 0 ? calc : undefined;
}

export function buildPaymentReviewBookingPricingDisplay(input: {
  rentPaise: number;
  depositPaise: number;
  bookingDetails?: PaymentReviewBookingDetails | null;
  bookingContext?: PaymentBookingContextView | null;
  checkInDate?: string | null;
  expectedCheckoutDate?: string | null;
}): PaymentReviewBookingPricingDisplay {
  const rentPaise = Math.max(0, input.rentPaise);
  const depositPaise = Math.max(0, input.depositPaise);
  const details = input.bookingDetails;
  const isShortStay = isShortStayPaymentReviewBooking(details);

  const moveIn =
    input.checkInDate ??
    details?.moveInDate ??
    input.bookingContext?.moveInDate ??
    null;
  const moveOut =
    input.expectedCheckoutDate ??
    details?.moveOutDate ??
    input.bookingContext?.moveOutDate ??
    null;

  if (!isShortStay) {
    const rows: PaymentReviewPricingRow[] = [];
    if (moveIn) rows.push({ label: 'Move-in', value: formatDate(moveIn) });
    rows.push({ label: 'Monthly rent', value: paiseToInr(rentPaise) });
    rows.push({ label: 'Deposit', value: paiseToInr(depositPaise) });
    return { kind: 'monthly', rows };
  }

  const stayDays =
    resolvePaymentReviewStayDays(moveIn, moveOut) ??
    (() => {
      const duration = input.bookingContext?.duration;
      if (!duration) return null;
      const match = duration.match(/^(\d+)\s+night/);
      return match ? Number(match[1]) : null;
    })();

  const rows: PaymentReviewPricingRow[] = [];
  if (moveIn && moveOut) {
    rows.push({
      label: 'Stay period',
      value: `${formatDate(moveIn)} → ${formatDate(moveOut)}`,
    });
  }
  if (stayDays != null) {
    rows.push({
      label: 'Stay duration',
      value: `${stayDays} day${stayDays === 1 ? '' : 's'}`,
    });
  }
  rows.push({
    label: 'Short-stay rent',
    value: paiseToInr(rentPaise),
    detail: rentBreakdownDetail(input),
  });
  rows.push({ label: 'Deposit', value: paiseToInr(depositPaise) });

  return { kind: 'short_stay', rows };
}
