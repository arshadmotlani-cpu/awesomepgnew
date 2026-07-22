/**
 * SSOT reader for booking rent + deposit balances (required / received / outstanding).
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, electricityInvoices, rentInvoices } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import {
  computeMoneySlice,
  type BookingMoneyBalances,
  type MoneyBalanceSlice,
} from '@/src/lib/billing/bookingMoneyBalances';
import { breakdownBookingCheckoutPayment } from '@/src/lib/billing/bookingCheckoutTotals';
import { resolveBookingDepositCreditAppliedPaise } from '@/src/lib/billing/bookingCheckoutTotals';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

async function sumPaidRentInvoicesPaise(bookingId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${rentInvoices.paidPrincipalPaise}), 0)::bigint::int`,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, bookingId));
  return Math.max(0, row?.total ?? 0);
}

async function electricityBalancesForBooking(bookingId: string): Promise<MoneyBalanceSlice> {
  const rows = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.bookingId, bookingId));

  let requiredPaise = 0;
  let receivedPaise = 0;
  for (const inv of rows) {
    if (inv.status === 'cancelled') continue;
    const projected = projectElectricityInvoice(inv);
    requiredPaise += inv.amountPaise + projected.accruedLateFeePaise;
    receivedPaise += inv.paidPaise;
  }
  return computeMoneySlice(requiredPaise, receivedPaise);
}

export async function getBookingMoneyBalances(
  bookingId: string,
): Promise<BookingMoneyBalances | null> {
  const [booking] = await db
    .select({
      id: bookings.id,
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      pricingSnapshot: bookings.pricingSnapshot,
      rentReceivedPaise: bookings.rentReceivedPaise,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) return null;

  const snapshot = booking.pricingSnapshot as PricingSnapshot | null;
  const breakdown = breakdownBookingCheckoutPayment({
    subtotalPaise: booking.subtotalPaise,
    discountPaise: booking.discountPaise,
    depositPaise: booking.depositPaise,
    pricingSnapshot: snapshot,
  });

  const depositCredit = resolveBookingDepositCreditAppliedPaise(snapshot?.depositCredit);
  const depositRequired = guardDepositPaise(
    booking.depositPaise - depositCredit,
    'balances.depositRequired',
  );

  const wallet = await getDepositSummaryForBooking(bookingId);
  const depositReceived = guardDepositPaise(
    wallet?.collectedPaise ?? 0,
    'balances.depositReceived',
  );

  const rentRequired = breakdown.rentDuePaise;
  const invoiceRent = await sumPaidRentInvoicesPaise(bookingId);
  const rentReceived = Math.max(
    guardDepositPaise(booking.rentReceivedPaise ?? 0, 'balances.rentReceived'),
    invoiceRent,
  );

  let electricity = computeMoneySlice(0, 0);
  try {
    electricity = await electricityBalancesForBooking(bookingId);
  } catch {
    // Non-fatal — booking may lack electricity rows yet.
  }

  return {
    bookingId: booking.id,
    rent: computeMoneySlice(rentRequired, rentReceived),
    deposit: {
      ...computeMoneySlice(depositRequired, depositReceived),
      refundablePaise: guardDepositPaise(
        wallet?.refundableBalancePaise ?? 0,
        'balances.refundable',
      ),
    },
    electricity,
  };
}

export async function syncBookingRentReceivedPaise(bookingId: string): Promise<number> {
  const paid = await sumPaidRentInvoicesPaise(bookingId);
  await db
    .update(bookings)
    .set({ rentReceivedPaise: paid, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));
  return paid;
}
