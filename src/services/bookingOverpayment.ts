/**
 * Booking checkout overpayment — apply admin-selected disposition after rent/deposit/prior allocation.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import type { OverpaymentDisposition } from '@/src/lib/operations/paymentReviewTypes';
import {
  bookingOverpaymentRefundPendingReason,
  bookingOverpaymentWalletCreditReason,
} from '@/src/lib/billing/bookingOverpaymentConstants';
import { splitBookingPayment } from '@/src/services/depositCollection';

export type BookingOverpaymentDisposition = OverpaymentDisposition;

export function normalizeOverpaymentDisposition(
  raw: string | undefined | null,
): BookingOverpaymentDisposition | null {
  if (!raw) return null;
  if (raw === 'refund' || raw === 'refund_later') return 'refund_later';
  if (raw === 'wallet_credit' || raw === 'allocate_deposit') return 'allocate_deposit';
  if (raw === 'future_adjustment' || raw === 'advance_credit') return 'advance_credit';
  if (raw === 'allocate_rent') return 'allocate_rent';
  if (raw === 'allocate_electricity') return 'allocate_electricity';
  return null;
}

/** Unallocated paise after rent + deposit + prior-outstanding slices. */
export function computeBookingCheckoutOverpaymentPaise(input: {
  booking: {
    subtotalPaise: number;
    discountPaise: number;
    depositPaise: number;
    totalPaise: number;
    pricingSnapshot?: PricingSnapshot | null;
  };
  amountPaise: number;
  membershipAmountPaise?: number;
  priorOutstandingAppliedPaise?: number;
}): number {
  const bookingPaymentPaise = Math.max(
    0,
    input.amountPaise - (input.membershipAmountPaise ?? 0),
  );
  const split = splitBookingPayment(input.booking, bookingPaymentPaise);
  const priorOutstandingPaise = Math.max(
    0,
    input.booking.pricingSnapshot?.priorOutstanding?.totalPaise ?? 0,
  );
  const priorAllocatedPaise =
    input.priorOutstandingAppliedPaise ??
    Math.min(
      priorOutstandingPaise,
      Math.max(0, bookingPaymentPaise - split.rentPaisePaid - split.depositPaisePaid),
    );
  const allocated = split.rentPaisePaid + split.depositPaisePaid + priorAllocatedPaise;
  return Math.max(0, bookingPaymentPaise - allocated);
}

export type ApplyBookingOverpaymentInput = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  paymentId: string;
  excessPaise: number;
  disposition: BookingOverpaymentDisposition;
  approvedByAdminId?: string | null;
};

export type ApplyBookingOverpaymentResult = {
  ledgerEntryId?: string;
  auditLogId?: string;
  snapshotUpdated: boolean;
};

/**
 * Apply overpayment disposition — each path writes audit_log; wallet/refund also touch deposit_ledger.
 */
export async function applyBookingOverpaymentDisposition(
  input: ApplyBookingOverpaymentInput,
): Promise<ApplyBookingOverpaymentResult> {
  if (input.excessPaise <= 0) {
    return { snapshotUpdated: false };
  }

  const disposition = input.disposition;
  const adminId = input.approvedByAdminId ?? null;

  if (disposition === 'allocate_deposit' || disposition === 'wallet_credit') {
    const { recordDepositCollected } = await import('@/src/services/deposits');
    const result = await recordDepositCollected({
      bookingId: input.bookingId,
      customerId: input.customerId,
      amountPaise: input.excessPaise,
      reason: bookingOverpaymentWalletCreditReason(input.bookingCode, input.paymentId),
      relatedPaymentId: input.paymentId,
      createdByAdminId: adminId,
    });

    const [auditRow] = await db
      .insert(auditLog)
      .values({
        actorType: adminId ? 'admin' : 'system',
        actorId: adminId,
        entity: 'booking',
        entityId: input.bookingId,
        action: 'booking_overpayment_wallet_credit',
        diff: {
          paymentId: input.paymentId,
          excessPaise: input.excessPaise,
          ledgerEntryId: result.entryId,
        },
      })
      .returning({ id: auditLog.id });

    const { notifyBookingOverpaymentWalletCredit } = await import('@/src/lib/email/notifications');
    notifyBookingOverpaymentWalletCredit({
      customerId: input.customerId,
      bookingCode: input.bookingCode,
      excessPaise: input.excessPaise,
    });

    return {
      ledgerEntryId: result.entryId,
      auditLogId: auditRow.id,
      snapshotUpdated: false,
    };
  }

  if (disposition === 'refund_later' || disposition === 'refund') {
    const [bookingRow] = await db
      .select({ pricingSnapshot: bookings.pricingSnapshot })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .limit(1);

    const snapshot = (bookingRow?.pricingSnapshot ?? {}) as PricingSnapshot;
    const credits = [...(snapshot.checkoutCredits ?? [])];
    credits.push({
      amountPaise: input.excessPaise,
      kind: 'refund_pending',
      relatedPaymentId: input.paymentId,
      createdAt: new Date().toISOString(),
      note: bookingOverpaymentRefundPendingReason(input.bookingCode, input.paymentId),
    });

    await db
      .update(bookings)
      .set({
        pricingSnapshot: { ...snapshot, checkoutCredits: credits },
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, input.bookingId));

    const [auditRow] = await db
      .insert(auditLog)
      .values({
        actorType: adminId ? 'admin' : 'system',
        actorId: adminId,
        entity: 'booking',
        entityId: input.bookingId,
        action: 'booking_overpayment_refund_pending',
        diff: {
          paymentId: input.paymentId,
          excessPaise: input.excessPaise,
          status: 'pending_operator_refund',
        },
      })
      .returning({ id: auditLog.id });

    const { notifyBookingOverpaymentRefundPending } = await import('@/src/lib/email/notifications');
    notifyBookingOverpaymentRefundPending({
      customerId: input.customerId,
      bookingCode: input.bookingCode,
      excessPaise: input.excessPaise,
    });

    return {
      auditLogId: auditRow.id,
      snapshotUpdated: true,
    };
  }

  if (disposition === 'advance_credit' || disposition === 'future_adjustment') {
    const { recordResidentCredit } = await import('@/src/services/residentCreditLedger');
    await recordResidentCredit({
      customerId: input.customerId,
      bookingId: input.bookingId,
      amountPaise: input.excessPaise,
      reason: `Advance credit from overpayment — booking ${input.bookingCode}`,
      relatedPaymentId: input.paymentId,
      createdByAdminId: adminId,
    });

    const [auditRow] = await db
      .insert(auditLog)
      .values({
        actorType: adminId ? 'admin' : 'system',
        actorId: adminId,
        entity: 'booking',
        entityId: input.bookingId,
        action: 'booking_overpayment_advance_credit',
        diff: {
          paymentId: input.paymentId,
          excessPaise: input.excessPaise,
        },
      })
      .returning({ id: auditLog.id });

    return {
      auditLogId: auditRow.id,
      snapshotUpdated: false,
    };
  }

  if (disposition === 'allocate_rent') {
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
    if (!booking) {
      throw new Error('Booking not found for rent overpayment allocation.');
    }
    const { applyBookingRentInvoiceOnPaymentSuccess } = await import('./bookingPaymentInvoices');
    const rentResult = await applyBookingRentInvoiceOnPaymentSuccess({
      booking,
      paymentId: input.paymentId,
      paymentAmountPaise: input.excessPaise,
      providerPaymentId: input.paymentId,
      rentPaisePaidOverride: input.excessPaise,
    });
    if (!rentResult.ok) {
      throw new Error(rentResult.reason);
    }
    const { syncBookingRentReceivedPaise } = await import('./bookingMoneyBalances');
    await syncBookingRentReceivedPaise(input.bookingId);

    const [auditRow] = await db
      .insert(auditLog)
      .values({
        actorType: adminId ? 'admin' : 'system',
        actorId: adminId,
        entity: 'booking',
        entityId: input.bookingId,
        action: 'booking_overpayment_allocate_rent',
        diff: { paymentId: input.paymentId, excessPaise: input.excessPaise },
      })
      .returning({ id: auditLog.id });

    return { auditLogId: auditRow.id, snapshotUpdated: false };
  }

  if (disposition === 'allocate_electricity') {
    const { applyElectricityAllocationForBooking } = await import('./paymentAllocation');
    const elecResult = await applyElectricityAllocationForBooking({
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      amountPaise: input.excessPaise,
      approvedByAdminId: adminId,
    });
    if (!elecResult.ok) {
      throw new Error(elecResult.reason);
    }

    const [auditRow] = await db
      .insert(auditLog)
      .values({
        actorType: adminId ? 'admin' : 'system',
        actorId: adminId,
        entity: 'booking',
        entityId: input.bookingId,
        action: 'booking_overpayment_allocate_electricity',
        diff: { paymentId: input.paymentId, excessPaise: input.excessPaise },
      })
      .returning({ id: auditLog.id });

    return { auditLogId: auditRow.id, snapshotUpdated: false };
  }

  throw new Error(`Unknown overpayment disposition: ${disposition}`);
}
