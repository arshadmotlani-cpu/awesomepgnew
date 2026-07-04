/**
 * Checkout rent allocation — anniversary billing SSOT.
 *
 * Monthly/open-ended checkout quotes one full month upfront; the first
 * rent invoice is also one full month. No calendar proration or advance credit.
 */
import type { PricingSnapshot } from '@/src/db/schema/bookings';

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

/** Pure — checkout rent is always one full month for monthly-like stays. */
export function computeCheckoutRentProration(input: {
  subtotalPaise: number;
  discountPaise: number;
  durationMode: string;
  stayStartDate: string | null | undefined;
  pricingSnapshot?: PricingSnapshot | null;
}): CheckoutRentProration {
  const quotedRentPaise = Math.max(0, input.subtotalPaise - input.discountPaise);
  const monthlyRentPaise = resolveMonthlyRentPaise(input);

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
