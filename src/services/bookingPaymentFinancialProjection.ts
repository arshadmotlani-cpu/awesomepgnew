/**
 * SSOT — booking checkout payment financial story for invoices and admin surfaces.
 * Allocation uses allocateBookingCheckoutPayment; deposit held uses getDepositSummaryForBooking.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, payments } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import {
  allocateBookingCheckoutPayment,
  type BookingPaymentAllocation,
} from '@/src/lib/billing/bookingPaymentAllocation';
import { formatDate } from '@/src/lib/format';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export type BookingPaymentAllocationLine = {
  key: string;
  label: string;
  amountPaise: number;
};

export type BookingPaymentFinancialStory = {
  paymentId: string;
  totalPaymentPaise: number;
  paidAt: string | null;
  allocationLines: BookingPaymentAllocationLine[];
  currentDepositHeldPaise: number;
};

type BookingCheckoutRow = {
  subtotalPaise: number;
  discountPaise: number;
  depositPaise: number;
  totalPaise: number;
  pricingSnapshot: PricingSnapshot | null;
};

function depositTransferLabel(snapshot: PricingSnapshot | null | undefined): string {
  const credit = snapshot?.depositCredit;
  if (credit?.sourceBookingCode?.trim()) {
    return `Deposit transfer from ${credit.sourceBookingCode.trim()}`;
  }
  const priorCode = snapshot?.priorOutstanding?.items?.find(
    (item) => item.bookingCode?.trim(),
  )?.bookingCode;
  if (priorCode?.trim()) {
    return `Deposit transfer from ${priorCode.trim()}`;
  }
  return 'Deposit transfer';
}

function priorOutstandingLabel(snapshot: PricingSnapshot | null | undefined): string {
  const items = snapshot?.priorOutstanding?.items ?? [];
  const depositItems = items.filter((item) => item.kind === 'deposit');
  if (depositItems.length === 1) {
    return 'Previous deposit due cleared';
  }
  if (items.length === 1 && items[0].label?.trim()) {
    return items[0].label.trim();
  }
  return 'Previous deposit due cleared';
}

export function buildBookingPaymentAllocationLines(
  booking: { pricingSnapshot?: PricingSnapshot | null },
  allocation: BookingPaymentAllocation,
): BookingPaymentAllocationLine[] {
  const snapshot = booking.pricingSnapshot;
  const lines: BookingPaymentAllocationLine[] = [];

  if (allocation.rentPaise > 0) {
    lines.push({ key: 'rent', label: 'Rent', amountPaise: allocation.rentPaise });
  }
  if (allocation.depositTransferCreditPaise > 0) {
    lines.push({
      key: 'deposit_transfer',
      label: depositTransferLabel(snapshot),
      amountPaise: allocation.depositTransferCreditPaise,
    });
  }
  if (allocation.depositCashPaise > 0) {
    lines.push({
      key: 'deposit_collected',
      label: 'Deposit collected',
      amountPaise: allocation.depositCashPaise,
    });
  }
  if (allocation.priorOutstandingPaise > 0) {
    lines.push({
      key: 'prior_outstanding',
      label: priorOutstandingLabel(snapshot),
      amountPaise: allocation.priorOutstandingPaise,
    });
  }

  return lines;
}

async function loadBookingCheckoutRow(bookingId: string): Promise<BookingCheckoutRow | null> {
  const [booking] = await db
    .select({
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      totalPaise: bookings.totalPaise,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return null;
  return {
    ...booking,
    pricingSnapshot: (booking.pricingSnapshot as PricingSnapshot | null) ?? null,
  };
}

async function resolveSucceededBookingPaymentId(
  bookingId: string,
  paymentId?: string | null,
): Promise<string | null> {
  if (paymentId) return paymentId;

  const [pay] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, bookingId),
        eq(payments.purpose, 'booking'),
        eq(payments.status, 'succeeded'),
      ),
    )
    .orderBy(desc(payments.paidAt))
    .limit(1);

  return pay?.id ?? null;
}

export async function loadBookingPaymentFinancialStory(input: {
  bookingId: string;
  paymentId?: string | null;
}): Promise<BookingPaymentFinancialStory | null> {
  const booking = await loadBookingCheckoutRow(input.bookingId);
  if (!booking) return null;

  const paymentId = await resolveSucceededBookingPaymentId(input.bookingId, input.paymentId);
  if (!paymentId) return null;

  const [pay] = await db
    .select({
      amountPaise: payments.amountPaise,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  if (!pay) return null;

  const allocation = allocateBookingCheckoutPayment(booking, pay.amountPaise);
  const allocationLines = buildBookingPaymentAllocationLines(booking, allocation);
  if (allocationLines.length === 0) return null;

  const depositSummary = await getDepositSummaryForBooking(input.bookingId);

  return {
    paymentId,
    totalPaymentPaise: pay.amountPaise,
    paidAt: pay.paidAt ? formatDate(pay.paidAt) : null,
    allocationLines,
    currentDepositHeldPaise: depositSummary?.refundableBalancePaise ?? 0,
  };
}
