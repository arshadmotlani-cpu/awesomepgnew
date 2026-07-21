/**
 * Admin-controlled payment allocation — rent and deposit independently.
 * Payment amount on pg_payment_records stays immutable; allocation drives ledger.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import {
  validatePaymentAllocation,
  type PaymentAllocationInput,
} from '@/src/lib/billing/bookingMoneyBalances';
import { breakdownBookingCheckoutPayment } from '@/src/lib/billing/bookingCheckoutTotals';
import { resolveBookingDepositCreditAppliedPaise } from '@/src/lib/billing/bookingCheckoutTotals';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import {
  getBookingMoneyBalances,
  syncBookingRentReceivedPaise,
} from '@/src/services/bookingMoneyBalances';
import {
  applyFullDepositOnConfirm,
  applyPartialDepositOnConfirm,
  syncDepositCollectionFromLedger,
} from '@/src/services/depositCollection';
import { recordDepositCollected } from '@/src/services/deposits';
import { applyBookingRentInvoiceOnPaymentSuccess } from '@/src/services/bookingPaymentInvoices';

export type AdminPaymentAllocation = PaymentAllocationInput & {
  depositDueDate?: string;
  approvedByAdminId: string;
  allocationNotes?: string;
};

export async function validateAdminPaymentAllocation(input: {
  bookingId: string;
  allocation: AdminPaymentAllocation;
}): Promise<{ ok: true; balances: NonNullable<Awaited<ReturnType<typeof getBookingMoneyBalances>>> } | { ok: false; reason: string }> {
  const balances = await getBookingMoneyBalances(input.bookingId);
  if (!balances) {
    return { ok: false, reason: 'Booking not found.' };
  }

  const check = validatePaymentAllocation({
    allocation: input.allocation,
    rentOutstandingBeforePaise: balances.rent.outstandingPaise,
    depositOutstandingBeforePaise: balances.deposit.outstandingPaise,
    allowRentPrepay: true,
  });
  if (!check.ok) return check;

  return { ok: true, balances };
}

export async function applyAdminPaymentAllocation(input: {
  booking: {
    id: string;
    customerId: string;
    bookingCode: string;
    durationMode: string;
    subtotalPaise: number;
    discountPaise: number;
    depositPaise: number;
    totalPaise: number;
    pricingSnapshot: PricingSnapshot | null;
  };
  paymentId: string;
  providerPaymentId: string;
  membershipAmountPaise?: number;
  allocation: AdminPaymentAllocation;
  pgPaymentRecordId?: string;
}): Promise<{ ok: true; unallocatedPaise: number } | { ok: false; reason: string }> {
  const validation = await validateAdminPaymentAllocation({
    bookingId: input.booking.id,
    allocation: input.allocation,
  });
  if (!validation.ok) return validation;

  const { allocation } = input;
  const rentAllocated = guardDepositPaise(allocation.rentAllocatedPaise, 'alloc.rent');
  const depositAllocated = guardDepositPaise(
    allocation.depositAllocatedPaise,
    'alloc.deposit',
  );

  if (rentAllocated > 0) {
    const rentResult = await applyBookingRentInvoiceOnPaymentSuccess({
      booking: input.booking,
      paymentId: input.paymentId,
      paymentAmountPaise: input.allocation.confirmedReceivedPaise,
      membershipAmountPaise: input.membershipAmountPaise,
      providerPaymentId: input.providerPaymentId,
      rentPaisePaidOverride: rentAllocated,
    });
    if (!rentResult.ok) {
      return { ok: false, reason: rentResult.reason };
    }
  }

  if (depositAllocated > 0) {
    await recordDepositCollected({
      bookingId: input.booking.id,
      customerId: input.booking.customerId,
      amountPaise: depositAllocated,
      reason: input.pgPaymentRecordId
        ? `deposit allocation — payment proof ${input.pgPaymentRecordId}`
        : `deposit allocation — payment ${input.providerPaymentId}`,
      relatedPaymentId: input.paymentId,
      createdByAdminId: allocation.approvedByAdminId,
    });
  }

  await syncDepositCollectionFromLedger(input.booking.id);
  await syncBookingRentReceivedPaise(input.booking.id);

  const snapshot = input.booking.pricingSnapshot;
  const creditApplied = resolveBookingDepositCreditAppliedPaise(snapshot?.depositCredit);
  const depositRequired = Math.max(0, input.booking.depositPaise - creditApplied);
  const balancesAfter = await getBookingMoneyBalances(input.booking.id);
  const depositOutstanding = balancesAfter?.deposit.outstandingPaise ?? 0;

  if (depositOutstanding > 0 && depositAllocated > 0) {
    const dueDate =
      allocation.depositDueDate ??
      new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    await applyPartialDepositOnConfirm({
      bookingId: input.booking.id,
      depositDuePaise: depositOutstanding,
      depositDueDate: dueDate,
      approvedByAdminId: allocation.approvedByAdminId,
    });
  } else if (depositRequired > 0 && depositOutstanding <= 0) {
    await applyFullDepositOnConfirm(input.booking.id);
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: allocation.approvedByAdminId,
    entity: 'booking_payment_allocation',
    entityId: input.booking.id,
    action: 'allocated',
    diff: {
      paymentId: input.paymentId,
      pgPaymentRecordId: input.pgPaymentRecordId ?? null,
      confirmedReceivedPaise: allocation.confirmedReceivedPaise,
      rentAllocatedPaise: rentAllocated,
      depositAllocatedPaise: depositAllocated,
      notes: allocation.allocationNotes ?? null,
    },
  });

  const unallocatedPaise = Math.max(
    0,
    allocation.confirmedReceivedPaise - rentAllocated - depositAllocated,
  );

  return { ok: true, unallocatedPaise };
}

/** Suggested allocation prefilled in admin UI (defaults to zeros — admin decides). */
export function suggestPaymentAllocation(input: {
  confirmedReceivedPaise: number;
  rentOutstandingPaise: number;
  depositOutstandingPaise: number;
}): PaymentAllocationInput {
  return {
    confirmedReceivedPaise: input.confirmedReceivedPaise,
    rentAllocatedPaise: 0,
    depositAllocatedPaise: 0,
  };
}

export function bookingCheckoutDues(booking: {
  subtotalPaise: number;
  discountPaise: number;
  depositPaise: number;
  pricingSnapshot?: PricingSnapshot | null;
}) {
  return breakdownBookingCheckoutPayment(booking);
}
