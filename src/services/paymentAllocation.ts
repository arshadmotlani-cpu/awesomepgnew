/**
 * Admin-controlled payment allocation — rent, deposit, electricity, and other independently.
 * Payment amount on pg_payment_records stays immutable; allocation drives ledger + invoices.
 */

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings, electricityInvoices } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import {
  totalAllocatedPaise,
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
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { recordResidentCredit } from '@/src/services/residentCreditLedger';

export type AdminPaymentAllocation = PaymentAllocationInput & {
  depositDueDate?: string;
  approvedByAdminId: string;
  allocationNotes?: string;
};

export function normalizeAdminPaymentAllocation(input: {
  confirmedReceivedPaise: number;
  rentAllocatedPaise: number;
  depositAllocatedPaise: number;
  electricityAllocatedPaise?: number;
  otherAllocatedPaise?: number;
  depositDueDate?: string;
  approvedByAdminId: string;
  allocationNotes?: string;
}): AdminPaymentAllocation {
  return {
    confirmedReceivedPaise: input.confirmedReceivedPaise,
    rentAllocatedPaise: input.rentAllocatedPaise,
    depositAllocatedPaise: input.depositAllocatedPaise,
    electricityAllocatedPaise: input.electricityAllocatedPaise ?? 0,
    otherAllocatedPaise: input.otherAllocatedPaise ?? 0,
    depositDueDate: input.depositDueDate,
    approvedByAdminId: input.approvedByAdminId,
    allocationNotes: input.allocationNotes,
  };
}

export async function validateAdminPaymentAllocation(input: {
  bookingId: string;
  allocation: AdminPaymentAllocation;
}): Promise<
  | { ok: true; balances: NonNullable<Awaited<ReturnType<typeof getBookingMoneyBalances>>> }
  | { ok: false; reason: string }
> {
  const balances = await getBookingMoneyBalances(input.bookingId);
  if (!balances) {
    return { ok: false, reason: 'Booking not found.' };
  }

  const check = validatePaymentAllocation({
    allocation: input.allocation,
    rentOutstandingBeforePaise: balances.rent.outstandingPaise,
    depositOutstandingBeforePaise: balances.deposit.outstandingPaise,
    electricityOutstandingBeforePaise: balances.electricity.outstandingPaise,
    allowRentPrepay: true,
  });
  if (!check.ok) return check;

  return { ok: true, balances };
}

/** Apply electricity allocation to oldest outstanding invoice for a booking. */
export async function applyElectricityAllocationForBooking(input: {
  bookingId: string;
  paymentId: string;
  amountPaise: number;
  approvedByAdminId?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (input.amountPaise <= 0) return { ok: true };

  const invoices = await db
    .select()
    .from(electricityInvoices)
    .where(
      and(
        eq(electricityInvoices.bookingId, input.bookingId),
        eq(electricityInvoices.status, 'pending'),
      ),
    )
    .orderBy(asc(electricityInvoices.billingMonth));

  let remaining = input.amountPaise;
  for (const inv of invoices) {
    if (remaining <= 0) break;
    const projected = projectElectricityInvoice(inv);
    const due = Math.max(0, projected.outstandingPaise);
    if (due <= 0) continue;

    const applyPaise = Math.min(remaining, due);
    const { applyApprovedPaymentAtomic } = await import('./paymentSettlementAtomic');
    const result = await applyApprovedPaymentAtomic({
      purpose: 'electricity',
      provider: 'mock',
      providerPaymentId: `${input.paymentId}_elec_${inv.id}`,
      amountPaise: applyPaise,
      invoiceId: inv.id,
      offlineProvider: 'upi_manual',
      rawPayload: {
        source: 'admin_payment_allocation',
        relatedPaymentId: input.paymentId,
        approvedByAdminId: input.approvedByAdminId,
      },
    });
    if (!result.ok) {
      return { ok: false, reason: result.reason ?? 'Electricity allocation failed.' };
    }
    remaining -= applyPaise;
  }

  if (remaining > 0) {
    return {
      ok: false,
      reason: `₹${(remaining / 100).toFixed(0)} could not be applied — no outstanding electricity invoice.`,
    };
  }

  return { ok: true };
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
  const electricityAllocated = guardDepositPaise(
    allocation.electricityAllocatedPaise,
    'alloc.electricity',
  );
  const otherAllocated = guardDepositPaise(allocation.otherAllocatedPaise, 'alloc.other');

  if (rentAllocated > 0) {
    const rentResult = await applyBookingRentInvoiceOnPaymentSuccess({
      booking: input.booking,
      paymentId: input.paymentId,
      paymentAmountPaise: allocation.confirmedReceivedPaise,
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

  if (electricityAllocated > 0) {
    const elecResult = await applyElectricityAllocationForBooking({
      bookingId: input.booking.id,
      paymentId: input.paymentId,
      amountPaise: electricityAllocated,
      approvedByAdminId: allocation.approvedByAdminId,
    });
    if (!elecResult.ok) {
      return elecResult;
    }
  }

  if (otherAllocated > 0) {
    await recordResidentCredit({
      customerId: input.booking.customerId,
      bookingId: input.booking.id,
      amountPaise: otherAllocated,
      reason: input.pgPaymentRecordId
        ? `Other allocation — payment proof ${input.pgPaymentRecordId}`
        : `Other allocation — payment ${input.providerPaymentId}`,
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
      electricityAllocatedPaise: electricityAllocated,
      otherAllocatedPaise: otherAllocated,
      notes: allocation.allocationNotes ?? null,
    },
  });

  const unallocatedPaise = Math.max(
    0,
    allocation.confirmedReceivedPaise - totalAllocatedPaise(allocation),
  );

  return { ok: true, unallocatedPaise };
}

/** Suggested allocation prefilled in admin UI (defaults to zeros — admin decides). */
export function suggestPaymentAllocation(input: {
  confirmedReceivedPaise: number;
  rentOutstandingPaise: number;
  depositOutstandingPaise: number;
  electricityOutstandingPaise?: number;
}): PaymentAllocationInput {
  return {
    confirmedReceivedPaise: input.confirmedReceivedPaise,
    rentAllocatedPaise: 0,
    depositAllocatedPaise: 0,
    electricityAllocatedPaise: 0,
    otherAllocatedPaise: 0,
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
