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

export type BookingCheckoutSummaryLineKind =
  | 'rent'
  | 'coupon_discount'
  | 'deposit'
  | 'deposit_credit'
  | 'prior_outstanding'
  | 'other_charge'
  | 'total';

/** Ordered checkout summary rows for review / payment / side-rail UIs. */
export type BookingCheckoutSummaryLine = {
  kind: BookingCheckoutSummaryLineKind;
  label: string;
  /** Absolute paise amount; credits/discounts are still positive — use `isCredit` for display. */
  amountPaise: number;
  isCredit?: boolean;
  emphasize?: boolean;
};

/**
 * Build display lines: Rent (gross) → Coupon → Deposit → other → Total.
 * Coupon never reduces deposit. Lines sum to totalToCollectTodayPaise when credits are signed.
 */
export function buildBookingCheckoutSummaryLines(input: {
  rentSubtotalPaise: number;
  discountPaise?: number;
  depositRequiredPaise: number;
  depositCreditAppliedPaise?: number;
  priorOutstandingPaise?: number;
  otherCharges?: Array<{ label: string; amountPaise: number }>;
  totalToCollectTodayPaise: number;
  /** Reserve / hold flows hide deposit. */
  hideDeposit?: boolean;
  rentLabel?: string;
  depositLabel?: string;
  totalLabel?: string;
}): BookingCheckoutSummaryLine[] {
  const discountPaise = Math.max(0, input.discountPaise ?? 0);
  const depositRequiredPaise = Math.max(0, input.depositRequiredPaise);
  const depositCreditAppliedPaise = Math.max(0, input.depositCreditAppliedPaise ?? 0);
  const depositDueNowPaise = Math.max(0, depositRequiredPaise - depositCreditAppliedPaise);
  const priorOutstandingPaise = Math.max(0, input.priorOutstandingPaise ?? 0);
  const lines: BookingCheckoutSummaryLine[] = [];

  lines.push({
    kind: 'rent',
    label: input.rentLabel ?? 'Rent',
    amountPaise: Math.max(0, input.rentSubtotalPaise),
  });

  if (discountPaise > 0) {
    lines.push({
      kind: 'coupon_discount',
      label: 'Promo discount',
      amountPaise: discountPaise,
      isCredit: true,
    });
  }

  if (!input.hideDeposit && depositRequiredPaise > 0) {
    if (depositCreditAppliedPaise > 0) {
      lines.push({
        kind: 'deposit',
        label: input.depositLabel ?? 'Refundable deposit',
        amountPaise: depositRequiredPaise,
      });
      lines.push({
        kind: 'deposit_credit',
        label: 'Deposit credit',
        amountPaise: depositCreditAppliedPaise,
        isCredit: true,
      });
    } else {
      lines.push({
        kind: 'deposit',
        label: input.depositLabel ?? 'Refundable deposit',
        amountPaise: depositDueNowPaise,
      });
    }
  }

  if (priorOutstandingPaise > 0) {
    lines.push({
      kind: 'prior_outstanding',
      label: 'Outstanding from previous stay',
      amountPaise: priorOutstandingPaise,
    });
  }

  for (const charge of input.otherCharges ?? []) {
    if (charge.amountPaise > 0) {
      lines.push({
        kind: 'other_charge',
        label: charge.label,
        amountPaise: charge.amountPaise,
      });
    }
  }

  lines.push({
    kind: 'total',
    label: input.totalLabel ?? 'Total payable',
    amountPaise: Math.max(0, input.totalToCollectTodayPaise),
    emphasize: true,
  });

  return lines;
}

/** Credit applied only when admin explicitly transferred deposit from a prior booking. */
export function resolveBookingDepositCreditAppliedPaise(
  depositCredit?: {
    appliedPaise?: number;
    adminTransferred?: boolean;
  } | null,
): number {
  if (!depositCredit?.adminTransferred) return 0;
  return Math.max(0, depositCredit.appliedPaise ?? 0);
}

/** Payment breakdown for a persisted booking row + optional prior-outstanding snapshot. */
export function breakdownBookingCheckoutPayment(booking: {
  subtotalPaise: number;
  discountPaise: number;
  depositPaise: number;
  pricingSnapshot?: {
    depositCredit?: { appliedPaise?: number; adminTransferred?: boolean };
    priorOutstanding?: PriorOutstandingBalance;
  } | null;
}): {
  rentDuePaise: number;
  depositCashDuePaise: number;
  creditAppliedPaise: number;
  priorOutstandingPaise: number;
  bookingTotalDuePaise: number;
} {
  const creditAppliedPaise = resolveBookingDepositCreditAppliedPaise(
    booking.pricingSnapshot?.depositCredit,
  );
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
