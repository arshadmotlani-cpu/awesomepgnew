/**
 * Checkout rent allocation — supports anniversary and calendar-month-1st billing.
 */
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import {
  DEFAULT_NEW_RESIDENT_BILLING_POLICY,
  firstMonthRentForCalendarPolicy,
  firstOfMonth,
  type BillingCyclePolicy,
} from '@/src/services/billing';

export type CheckoutRentProration = {
  quotedRentPaise: number;
  monthlyRentPaise: number;
  firstMonthInvoiceRentPaise: number;
  advanceRentCreditPaise: number;
  billingMonth: string | null;
  daysActive: number | null;
  daysInMonth: number | null;
  isProrated: boolean;
  rentAllocationLabel: string;
};

function resolveMonthlyRentPaise(input: {
  subtotalPaise: number;
  discountPaise: number;
  pricingSnapshot?: PricingSnapshot | null;
}): number {
  const perBed = input.pricingSnapshot?.perBed?.[0];
  if (perBed?.monthlyRatePaise && perBed.monthlyRatePaise > 0) {
    return perBed.monthlyRatePaise;
  }
  return Math.max(0, input.subtotalPaise);
}

export function computeCheckoutRentProration(input: {
  subtotalPaise: number;
  discountPaise: number;
  durationMode: string;
  stayStartDate: string | null | undefined;
  pricingSnapshot?: PricingSnapshot | null;
  billingCyclePolicy?: BillingCyclePolicy;
}): CheckoutRentProration {
  const quotedRentPaise = Math.max(0, input.subtotalPaise - input.discountPaise);
  const monthlyRentPaise = resolveMonthlyRentPaise(input);
  const policy = input.billingCyclePolicy ?? DEFAULT_NEW_RESIDENT_BILLING_POLICY;

  const isMonthlyLike =
    input.durationMode === 'open_ended' || input.durationMode === 'monthly';

  if (!isMonthlyLike || !input.stayStartDate || quotedRentPaise <= 0) {
    return {
      quotedRentPaise,
      monthlyRentPaise,
      firstMonthInvoiceRentPaise: quotedRentPaise,
      advanceRentCreditPaise: 0,
      billingMonth: null,
      daysActive: null,
      daysInMonth: null,
      isProrated: false,
      rentAllocationLabel: 'Rent',
    };
  }

  if (policy === 'calendar_month_1st') {
    const proration = firstMonthRentForCalendarPolicy(monthlyRentPaise, input.stayStartDate);
    const billingMonth = firstOfMonth(input.stayStartDate);
    const label = proration.isFullMonth
      ? "First month's rent"
      : `Rent for ${proration.daysActive}/${proration.daysInMonth} days`;
    return {
      quotedRentPaise: proration.amountPaise,
      monthlyRentPaise,
      firstMonthInvoiceRentPaise: proration.amountPaise,
      advanceRentCreditPaise: 0,
      billingMonth,
      daysActive: proration.daysActive,
      daysInMonth: proration.daysInMonth,
      isProrated: !proration.isFullMonth,
      rentAllocationLabel: label,
    };
  }

  return {
    quotedRentPaise,
    monthlyRentPaise,
    firstMonthInvoiceRentPaise: quotedRentPaise,
    advanceRentCreditPaise: 0,
    billingMonth: input.stayStartDate.slice(0, 7) + '-01',
    daysActive: null,
    daysInMonth: null,
    isProrated: false,
    rentAllocationLabel: "First month's rent",
  };
}

export function sumAdvanceRentCreditFromSnapshot(
  snapshot: PricingSnapshot | null | undefined,
  paymentId?: string | null,
): number {
  const credits = snapshot?.checkoutCredits ?? [];
  return credits
    .filter(
      (c) =>
        c.kind === 'advance_rent_credit' &&
        (!paymentId || c.relatedPaymentId === paymentId),
    )
    .reduce((sum, c) => sum + Math.max(0, c.amountPaise), 0);
}
