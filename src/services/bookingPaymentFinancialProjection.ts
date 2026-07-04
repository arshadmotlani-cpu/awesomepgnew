/**
 * SSOT — booking checkout payment financial story for invoices and admin surfaces.
 * Allocation uses allocateBookingCheckoutPayment; deposit held uses getDepositSummaryForBooking.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, bookings, payments } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import {
  allocateBookingCheckoutPayment,
  type BookingPaymentAllocation,
} from '@/src/lib/billing/bookingPaymentAllocation';
import {
  computeCheckoutRentProration,
  sumAdvanceRentCreditFromSnapshot,
} from '@/src/lib/billing/checkoutRentProration';
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
  totalAllocatedPaise: number;
  advanceRentCreditPaise: number;
  currentDepositHeldPaise: number;
};

type BookingCheckoutRow = {
  subtotalPaise: number;
  discountPaise: number;
  depositPaise: number;
  totalPaise: number;
  durationMode: string;
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
  booking: {
    pricingSnapshot?: PricingSnapshot | null;
    subtotalPaise: number;
    discountPaise: number;
    durationMode: string;
  },
  allocation: BookingPaymentAllocation,
  options?: {
    stayStartDate?: string | null;
    paymentId?: string | null;
  },
): BookingPaymentAllocationLine[] {
  const snapshot = booking.pricingSnapshot;
  const lines: BookingPaymentAllocationLine[] = [];

  const proration = computeCheckoutRentProration({
    subtotalPaise: booking.subtotalPaise,
    discountPaise: booking.discountPaise,
    durationMode: booking.durationMode,
    stayStartDate: options?.stayStartDate,
    pricingSnapshot: snapshot,
  });

    if (allocation.rentPaise > 0) {
    const rentLabel =
      proration.rentAllocationLabel === "First month's rent"
        ? "✓ First month's rent"
        : `✓ ${proration.rentAllocationLabel}`;
    lines.push({
      key: 'rent_invoice',
      label: rentLabel,
      amountPaise: allocation.rentPaise,
    });
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
      label: '✓ Security deposit',
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

  if (allocation.unallocatedPaise > 0) {
    lines.push({
      key: 'unallocated',
      label: 'Unallocated (requires admin disposition)',
      amountPaise: allocation.unallocatedPaise,
    });
  }

  return lines;
}

export function sumAllocationLines(lines: BookingPaymentAllocationLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountPaise, 0);
}

async function loadBookingCheckoutRow(bookingId: string): Promise<BookingCheckoutRow | null> {
  const [booking] = await db
    .select({
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      totalPaise: bookings.totalPaise,
      durationMode: bookings.durationMode,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return null;
  return {
    ...booking,
    durationMode: booking.durationMode,
    pricingSnapshot: (booking.pricingSnapshot as PricingSnapshot | null) ?? null,
  };
}

async function loadPrimaryStayStart(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({
      stayStart: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
    })
    .from(bedReservations)
    .where(
      and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')),
    )
    .limit(1);
  return row?.stayStart ?? null;
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

  const stayStartDate = await loadPrimaryStayStart(input.bookingId);
  const allocation = allocateBookingCheckoutPayment(booking, pay.amountPaise);
  const allocationLines = buildBookingPaymentAllocationLines(booking, allocation, {
    stayStartDate,
    paymentId,
  });
  if (allocationLines.length === 0) return null;

  const depositSummary = await getDepositSummaryForBooking(input.bookingId);
  const storedAdvance = sumAdvanceRentCreditFromSnapshot(booking.pricingSnapshot, paymentId);
  const computedAdvance =
    allocationLines.find((l) => l.key === 'advance_rent_credit')?.amountPaise ?? 0;

  return {
    paymentId,
    totalPaymentPaise: pay.amountPaise,
    paidAt: pay.paidAt ? formatDate(pay.paidAt) : null,
    allocationLines,
    totalAllocatedPaise: sumAllocationLines(allocationLines),
    advanceRentCreditPaise: storedAdvance > 0 ? storedAdvance : computedAdvance,
    currentDepositHeldPaise: depositSummary?.refundableBalancePaise ?? 0,
  };
}
