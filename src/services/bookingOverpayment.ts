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

export type BookingOverpaymentDisposition = OverpaymentDisposition | 'refund';

export function normalizeOverpaymentDisposition(
  raw: string | undefined | null,
): BookingOverpaymentDisposition | null {
  if (!raw) return null;
  if (raw === 'refund' || raw === 'refund_later') return 'refund';
  if (raw === 'wallet_credit' || raw === 'future_adjustment') return raw;
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

  const disposition =
    input.disposition === 'refund_later' ? 'refund' : input.disposition;
  const adminId = input.approvedByAdminId ?? null;

  if (disposition === 'wallet_credit') {
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

  if (disposition === 'refund') {
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

  // future_adjustment — credit stored on pricing snapshot for next rent cycle
  const [bookingRow] = await db
    .select({ pricingSnapshot: bookings.pricingSnapshot })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  const snapshot = (bookingRow?.pricingSnapshot ?? {}) as PricingSnapshot;
  const credits = [...(snapshot.checkoutCredits ?? [])];
  credits.push({
    amountPaise: input.excessPaise,
    kind: 'future_rent_adjustment',
    relatedPaymentId: input.paymentId,
    createdAt: new Date().toISOString(),
    note: 'Overpayment held as credit toward future rent invoices',
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
      action: 'booking_overpayment_future_adjustment',
      diff: {
        paymentId: input.paymentId,
        excessPaise: input.excessPaise,
        checkoutCreditsCount: credits.length,
      },
    })
    .returning({ id: auditLog.id });

  const { notifyBookingOverpaymentFutureCredit } = await import('@/src/lib/email/notifications');
  notifyBookingOverpaymentFutureCredit({
    customerId: input.customerId,
    bookingCode: input.bookingCode,
    excessPaise: input.excessPaise,
  });

  return {
    auditLogId: auditRow.id,
    snapshotUpdated: true,
  };
}
