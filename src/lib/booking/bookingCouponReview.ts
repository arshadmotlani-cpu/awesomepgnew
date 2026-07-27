/**
 * Client-side booking review coupon + totals (SSOT with server recalc on create).
 */
import { computeNewBookingCheckoutTotals } from '@/src/lib/billing/bookingCheckoutTotals';
import type { ResolvedDiscount } from '@/src/lib/billing/discountEngine';

export type PreviewCouponState =
  | { status: 'idle' }
  | { status: 'applied'; discountPaise: number; netRentPaise: number; label?: string }
  | { status: 'invalid'; message?: string };

export type AppliedBookingCoupon = {
  code: string;
  discountPaise: number;
  label?: string;
};

export function appliedBookingCouponDiscountPaise(
  applied: AppliedBookingCoupon | null | undefined,
): number {
  if (!applied || applied.discountPaise <= 0) return 0;
  return applied.discountPaise;
}

export function reviewCheckoutTotalsWithCoupon(input: {
  rentSubtotalPaise: number;
  depositRequiredPaise: number;
  depositCreditAppliedPaise?: number;
  priorOutstandingPaise?: number;
  appliedCoupon: AppliedBookingCoupon | null;
}) {
  const prior = input.priorOutstandingPaise ?? 0;
  return computeNewBookingCheckoutTotals({
    rentSubtotalPaise: input.rentSubtotalPaise,
    depositRequiredPaise: input.depositRequiredPaise,
    depositCreditAppliedPaise: input.depositCreditAppliedPaise ?? 0,
    discountPaise: appliedBookingCouponDiscountPaise(input.appliedCoupon),
    priorOutstanding: prior > 0 ? { totalPaise: prior, items: [] } : null,
  });
}

/** Maps resolveCheckoutDiscount output to preview UI state (testable without DB). */
export function previewCouponStateFromDiscount(
  result: ResolvedDiscount | { error: string },
  subtotalPaise: number,
): PreviewCouponState {
  if ('error' in result) {
    return { status: 'invalid', message: result.error };
  }
  if (result.discountPaise <= 0) {
    return { status: 'invalid', message: 'Invalid or expired promo code' };
  }
  return {
    status: 'applied',
    discountPaise: result.discountPaise,
    netRentPaise: subtotalPaise - result.discountPaise,
    label: result.label ?? undefined,
  };
}

export function applyBookingReviewCoupon(
  _current: AppliedBookingCoupon | null,
  next: AppliedBookingCoupon,
): AppliedBookingCoupon {
  return {
    code: next.code.trim().toUpperCase(),
    discountPaise: next.discountPaise,
    label: next.label,
  };
}

export function removeBookingReviewCoupon(): null {
  return null;
}
