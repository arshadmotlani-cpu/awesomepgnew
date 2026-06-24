/**
 * SSOT — how a succeeded booking checkout payment is allocated.
 * Mirrors recordPaymentSuccess / applyBookingPaymentFinancialMirrors order:
 *   rent → deposit cash → prior outstanding → (optional) overpayment
 */
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { breakdownBookingCheckoutPayment } from '@/src/lib/billing/bookingCheckoutTotals';
import { splitBookingPayment } from '@/src/services/depositCollection';

export type BookingPaymentAllocation = {
  rentPaise: number;
  depositCashPaise: number;
  priorOutstandingPaise: number;
  depositTransferCreditPaise: number;
  unallocatedPaise: number;
  rentDuePaise: number;
  depositCashDuePaise: number;
  priorOutstandingDuePaise: number;
};

export function allocateBookingCheckoutPayment(
  booking: {
    subtotalPaise: number;
    discountPaise: number;
    depositPaise: number;
    totalPaise: number;
    pricingSnapshot?: PricingSnapshot | null;
  },
  bookingPaymentPaise: number,
): BookingPaymentAllocation {
  const breakdown = breakdownBookingCheckoutPayment(booking);
  const split = splitBookingPayment(booking, bookingPaymentPaise);
  const newBookingPaid = split.rentPaisePaid + split.depositPaisePaid;
  const priorOutstandingPaise = Math.min(
    breakdown.priorOutstandingPaise,
    Math.max(0, bookingPaymentPaise - newBookingPaid),
  );
  const depositTransferCreditPaise = breakdown.creditAppliedPaise;
  const allocated =
    split.rentPaisePaid + split.depositPaisePaid + priorOutstandingPaise;
  const unallocatedPaise = Math.max(0, bookingPaymentPaise - allocated);

  return {
    rentPaise: split.rentPaisePaid,
    depositCashPaise: split.depositPaisePaid,
    priorOutstandingPaise,
    depositTransferCreditPaise,
    unallocatedPaise,
    rentDuePaise: breakdown.rentDuePaise,
    depositCashDuePaise: breakdown.depositCashDuePaise,
    priorOutstandingDuePaise: breakdown.priorOutstandingPaise,
  };
}
