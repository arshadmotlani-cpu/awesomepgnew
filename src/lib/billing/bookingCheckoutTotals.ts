/**
 * SSOT for "rent + deposit − credit + prior outstanding" at booking checkout.
 * UI and payment validation must use these helpers — never show rent alone as total.
 */

export type PriorOutstandingItem = {
  label: string;
  amountPaise: number;
  bookingId?: string;
  bookingCode?: string;
  kind: 'deposit' | 'rent' | 'electricity' | 'other';
};

export type PriorOutstandingBalance = {
  totalPaise: number;
  items: PriorOutstandingItem[];
};

export type NewBookingCheckoutTotals = {
  rentDuePaise: number;
  depositRequiredPaise: number;
  depositCreditAppliedPaise: number;
  depositDueNowPaise: number;
  /** Rent + deposit due for this booking only (excludes prior outstanding). */
  newBookingTotalPaise: number;
  priorOutstandingPaise: number;
  /** Full amount to collect at checkout (new booking + prior balance). */
  totalToCollectTodayPaise: number;
};

export function computeNewBookingCheckoutTotals(input: {
  rentSubtotalPaise: number;
  depositRequiredPaise: number;
  depositCreditAppliedPaise?: number;
  discountPaise?: number;
  priorOutstanding?: PriorOutstandingBalance | null;
  ps4Paise?: number;
}): NewBookingCheckoutTotals {
  const rentDuePaise = Math.max(0, input.rentSubtotalPaise - (input.discountPaise ?? 0));
  const depositCreditAppliedPaise = Math.max(0, input.depositCreditAppliedPaise ?? 0);
  const depositDueNowPaise = Math.max(0, input.depositRequiredPaise - depositCreditAppliedPaise);
  const newBookingTotalPaise = rentDuePaise + depositDueNowPaise;
  const priorOutstandingPaise = Math.max(0, input.priorOutstanding?.totalPaise ?? 0);
  const totalToCollectTodayPaise =
    newBookingTotalPaise + priorOutstandingPaise + Math.max(0, input.ps4Paise ?? 0);

  return {
    rentDuePaise,
    depositRequiredPaise: input.depositRequiredPaise,
    depositCreditAppliedPaise,
    depositDueNowPaise,
    newBookingTotalPaise,
    priorOutstandingPaise,
    totalToCollectTodayPaise,
  };
}

/** Payment breakdown for a persisted booking row + optional prior-outstanding snapshot. */
export function breakdownBookingCheckoutPayment(booking: {
  subtotalPaise: number;
  discountPaise: number;
  depositPaise: number;
  pricingSnapshot?: {
    depositCredit?: { appliedPaise?: number };
    priorOutstanding?: PriorOutstandingBalance;
  } | null;
}): {
  rentDuePaise: number;
  depositCashDuePaise: number;
  creditAppliedPaise: number;
  priorOutstandingPaise: number;
  bookingTotalDuePaise: number;
} {
  const creditAppliedPaise = booking.pricingSnapshot?.depositCredit?.appliedPaise ?? 0;
  const depositCashDuePaise = Math.max(0, booking.depositPaise - creditAppliedPaise);
  const rentDuePaise = Math.max(0, booking.subtotalPaise - booking.discountPaise);
  const priorOutstandingPaise = Math.max(
    0,
    booking.pricingSnapshot?.priorOutstanding?.totalPaise ?? 0,
  );
  const bookingTotalDuePaise = rentDuePaise + depositCashDuePaise + priorOutstandingPaise;

  return {
    rentDuePaise,
    depositCashDuePaise,
    creditAppliedPaise,
    priorOutstandingPaise,
    bookingTotalDuePaise,
  };
}
