/**
 * Admin payment proof approval with explicit allocation — financial truth for all review kinds.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, paymentLinks, rentInvoices } from '@/src/db/schema';
import {
  totalAllocatedPaise,
  type PaymentAllocationInput,
} from '@/src/lib/billing/bookingMoneyBalances';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminPaymentAllocationInput } from '@/src/services/qrPayments';
import { reviewPaymentRecord } from '@/src/services/qrPayments';
import { applyElectricityAllocationForBooking } from '@/src/services/paymentAllocation';
import { recordDepositCollected } from '@/src/services/deposits';
import { recordResidentCredit } from '@/src/services/residentCreditLedger';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { recordDepositPaymentFromLink } from '@/src/services/invoicePayment';

export type PaymentProofAllocationInput = AdminPaymentAllocationInput;

export function validatePaymentProofAllocation(
  allocation: PaymentProofAllocationInput,
): { ok: true } | { ok: false; reason: string } {
  if (allocation.confirmedReceivedPaise <= 0) {
    return { ok: false, reason: 'Resident paid amount must be greater than zero.' };
  }
  const allocated = totalAllocatedPaise(allocation as PaymentAllocationInput);
  if (allocated > allocation.confirmedReceivedPaise) {
    return { ok: false, reason: 'Allocated total cannot exceed resident paid.' };
  }
  if (allocated !== allocation.confirmedReceivedPaise) {
    return {
      ok: false,
      reason: `Allocate the full payment — ₹${((allocation.confirmedReceivedPaise - allocated) / 100).toFixed(0)} remaining.`,
    };
  }
  return { ok: true };
}

async function applySupplementalAllocation(input: {
  bookingId: string | null;
  customerId: string | null;
  paymentId: string;
  allocation: PaymentProofAllocationInput;
  skip?: Partial<Record<'rent' | 'deposit' | 'electricity', boolean>>;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const rentPaise = input.skip?.rent ? 0 : input.allocation.rentAllocatedPaise;
  const depositPaise = input.skip?.deposit ? 0 : input.allocation.depositAllocatedPaise;
  const electricityPaise = input.skip?.electricity
    ? 0
    : (input.allocation.electricityAllocatedPaise ?? 0);
  const otherPaise = input.allocation.otherAllocatedPaise ?? 0;

  if (!input.bookingId || !input.customerId) {
    if (rentPaise > 0 || depositPaise > 0 || electricityPaise > 0 || otherPaise > 0) {
      return {
        ok: false,
        reason: 'This payment needs a booking to apply rent, deposit, electricity, or other allocations.',
      };
    }
    return { ok: true };
  }

  if (rentPaise > 0) {
    const [booking] = await db
      .select({
        id: bookings.id,
        customerId: bookings.customerId,
        bookingCode: bookings.bookingCode,
        durationMode: bookings.durationMode,
        subtotalPaise: bookings.subtotalPaise,
        discountPaise: bookings.discountPaise,
        depositPaise: bookings.depositPaise,
        totalPaise: bookings.totalPaise,
        pricingSnapshot: bookings.pricingSnapshot,
      })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .limit(1);
    if (!booking) return { ok: false, reason: 'Booking not found for rent allocation.' };
    const { applyBookingRentInvoiceOnPaymentSuccess } = await import(
      '@/src/services/bookingPaymentInvoices'
    );
    const rentResult = await applyBookingRentInvoiceOnPaymentSuccess({
      booking,
      paymentId: input.paymentId,
      paymentAmountPaise: input.allocation.confirmedReceivedPaise,
      providerPaymentId: input.paymentId,
      rentPaisePaidOverride: rentPaise,
    });
    if (!rentResult.ok) {
      return { ok: false, reason: rentResult.reason ?? 'Rent allocation failed.' };
    }
  }

  if (depositPaise > 0) {
    await recordDepositCollected({
      bookingId: input.bookingId,
      customerId: input.customerId,
      amountPaise: depositPaise,
      reason: `Admin allocation — payment ${input.paymentId}`,
      relatedPaymentId: input.paymentId,
    });
    const { syncDepositCollectionFromLedger } = await import('@/src/services/depositCollection');
    await syncDepositCollectionFromLedger(input.bookingId);
  }

  if (electricityPaise > 0) {
    const result = await applyElectricityAllocationForBooking({
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      amountPaise: electricityPaise,
    });
    if (!result.ok) return result;
  }

  if (otherPaise > 0) {
    await recordResidentCredit({
      customerId: input.customerId,
      bookingId: input.bookingId,
      amountPaise: otherPaise,
      reason: `Admin allocation — advance credit (${input.paymentId})`,
      relatedPaymentId: input.paymentId,
    });
  }

  return { ok: true };
}

async function approveRentWithAllocation(
  session: AdminSession,
  invoiceId: string,
  allocation: PaymentProofAllocationInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [invoice] = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);
  if (!invoice) return { ok: false, message: 'Invoice not found.' };
  if (!invoice.paymentProofUrl) {
    return { ok: false, message: 'No payment photo uploaded.' };
  }

  const paymentId = `rent-proof-${invoiceId}`;

  if (allocation.rentAllocatedPaise > 0) {
    const { applyApprovedPaymentAtomic } = await import('@/src/services/paymentSettlementAtomic');
    const result = await applyApprovedPaymentAtomic({
      purpose: 'rent',
      provider: 'mock',
      offlineProvider: 'upi_manual',
      providerPaymentId: paymentId,
      amountPaise: allocation.rentAllocatedPaise,
      invoiceId,
      rawPayload: {
        source: 'payment_proof_allocation',
        confirmedReceivedPaise: allocation.confirmedReceivedPaise,
        rentAllocatedPaise: allocation.rentAllocatedPaise,
        depositAllocatedPaise: allocation.depositAllocatedPaise,
        electricityAllocatedPaise: allocation.electricityAllocatedPaise ?? 0,
        otherAllocatedPaise: allocation.otherAllocatedPaise ?? 0,
      },
    });
    if (!result.ok) {
      const [refreshed] = await db
        .select({ status: rentInvoices.status })
        .from(rentInvoices)
        .where(eq(rentInvoices.id, invoiceId))
        .limit(1);
      if (refreshed?.status !== 'paid') {
        return { ok: false, message: result.reason ?? 'Rent allocation failed.' };
      }
    }
  }

  const supplemental = await applySupplementalAllocation({
    bookingId: invoice.bookingId,
    customerId: invoice.customerId,
    paymentId,
    allocation,
    skip: { rent: true },
  });
  if (!supplemental.ok) return { ok: false, message: supplemental.reason };

  return { ok: true };
}

async function approveElectricityWithAllocation(
  session: AdminSession,
  invoiceId: string,
  allocation: PaymentProofAllocationInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  void session;
  const { fetchElectricityInvoiceById } = await import('@/src/lib/db/electricityInvoiceSelect');
  const invoice = await fetchElectricityInvoiceById(invoiceId);
  if (!invoice) return { ok: false, message: 'Invoice not found.' };
  if (!invoice.paymentProofUrl) {
    return { ok: false, message: 'No payment proof uploaded.' };
  }

  const paymentId = `qr-proof-${invoiceId}`;

  if ((allocation.electricityAllocatedPaise ?? 0) > 0) {
    const { applyApprovedPaymentAtomic } = await import('@/src/services/paymentSettlementAtomic');
    const result = await applyApprovedPaymentAtomic({
      purpose: 'electricity',
      provider: 'mock',
      providerPaymentId: paymentId,
      amountPaise: allocation.electricityAllocatedPaise ?? 0,
      invoiceId,
      offlineProvider: 'upi_manual',
      rawPayload: {
        source: 'payment_proof_allocation',
        confirmedReceivedPaise: allocation.confirmedReceivedPaise,
      },
    });
    if (!result.ok) {
      const projected = projectElectricityInvoice(invoice);
      if (projected.outstandingPaise > 0) {
        return { ok: false, message: result.reason ?? 'Electricity allocation failed.' };
      }
    }
  }

  const supplemental = await applySupplementalAllocation({
    bookingId: invoice.bookingId,
    customerId: invoice.customerId,
    paymentId,
    allocation,
    skip: { electricity: true },
  });
  if (!supplemental.ok) return { ok: false, message: supplemental.reason };

  return { ok: true };
}

async function approveDepositLinkWithAllocation(
  session: AdminSession,
  linkId: string,
  allocation: PaymentProofAllocationInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.id, linkId))
    .limit(1);
  if (!link) return { ok: false, message: 'Payment link not found.' };
  if (!link.paymentProofUrl) {
    return { ok: false, message: 'No payment photo uploaded.' };
  }
  if (!link.bookingId) return { ok: false, message: 'Deposit link missing booking.' };

  const paymentId = `deposit-link-proof-${linkId}`;

  if (allocation.depositAllocatedPaise > 0) {
    const depositResult = await recordDepositPaymentFromLink({
      linkId,
      bookingId: link.bookingId,
      customerId: link.residentId,
      amountPaise: allocation.depositAllocatedPaise,
      providerPaymentId: paymentId,
      reason: link.title
        ? `${link.title} (additional deposit)`
        : `Deposit payment link ${linkId}`,
    });
    if (!depositResult.ok) {
      return { ok: false, message: depositResult.error };
    }
    await db.update(paymentLinks).set({ status: 'paid' }).where(eq(paymentLinks.id, linkId));
  } else if (link.status === 'active') {
    await db.update(paymentLinks).set({ status: 'paid' }).where(eq(paymentLinks.id, linkId));
  }

  const supplemental = await applySupplementalAllocation({
    bookingId: link.bookingId,
    customerId: link.residentId,
    paymentId,
    allocation,
    skip: { deposit: true },
  });
  if (!supplemental.ok) return { ok: false, message: supplemental.reason };

  return { ok: true };
}

async function approveExtensionWithAllocation(
  session: AdminSession,
  extensionId: string,
  allocation: PaymentProofAllocationInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (allocation.rentAllocatedPaise <= 0) {
    return { ok: false, message: 'Extension payments must allocate at least some rent.' };
  }
  const { approveExtensionPaymentProof } = await import('@/src/services/extension');
  const result = await approveExtensionPaymentProof(session, extensionId);
  return result;
}

export async function approvePaymentProofWithAllocation(
  session: AdminSession,
  input: {
    kind: PendingPaymentReviewItem['kind'];
    entityId: string;
    pgId: string;
    allocation: PaymentProofAllocationInput;
    reviewMeta?: {
      reviewNotes?: string;
      approvalNotes?: string;
    };
  },
): Promise<
  | { ok: true; outcome?: 'approved' | 'already_approved' }
  | { ok: false; message: string }
> {
  const validation = validatePaymentProofAllocation(input.allocation);
  if (!validation.ok) return { ok: false, message: validation.reason };

  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, input.pgId)) {
    return { ok: false, message: 'Access denied.' };
  }

  switch (input.kind) {
    case 'qr': {
      const result = await reviewPaymentRecord(session, input.entityId, 'approved', {
        paymentAllocation: input.allocation,
        reviewMeta: input.reviewMeta,
      });
      return { ok: true, outcome: result.outcome };
    }
    case 'rent':
      return approveRentWithAllocation(session, input.entityId, input.allocation);
    case 'electricity':
      return approveElectricityWithAllocation(session, input.entityId, input.allocation);
    case 'deposit_link':
      return approveDepositLinkWithAllocation(session, input.entityId, input.allocation);
    case 'extension':
      return approveExtensionWithAllocation(session, input.entityId, input.allocation);
    default:
      return { ok: false, message: 'Unsupported payment type for allocation.' };
  }
}
