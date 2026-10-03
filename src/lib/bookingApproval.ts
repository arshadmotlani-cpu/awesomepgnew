/**
 * Booking approval lifecycle — gates resident dashboard, invoices, and deposit
 * ledger until admin confirms a submitted booking request (UPI proof reviewed).
 *
 * Flow:
 *   createBooking          → pending_payment
 *   submit payment proof   → pending_approval
 *   admin approves proof   → confirmed (+ active reservations, deposit ledger)
 *   admin rejects proof    → cancelled (+ hold release, no invoices/deposits)
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  bedReserveHolds,
  bookings,
  customers,
  payments,
  pgPaymentRecords,
  rentInvoices,
} from '@/src/db/schema';
import { isTerminalBookingLifecycleStatus } from '@/src/lib/booking/bookingStatus';
import { formatDate } from '@/src/lib/dates';
import { todayInBillingTimezone } from '@/src/lib/billing/billingTimezone';

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type BookingApprovalPhase =
  | 'awaiting_payment'
  | 'awaiting_admin_approval'
  | 'approved'
  | 'inactive';

const PRE_APPROVAL_STATUSES = ['pending_payment', 'pending_approval'] as const;
const APPROVED_STATUSES = ['confirmed', 'completed'] as const;

export function isPreApprovalBookingStatus(status: string): boolean {
  return (PRE_APPROVAL_STATUSES as readonly string[]).includes(status);
}

export function isApprovedBookingStatus(status: string): boolean {
  return (APPROVED_STATUSES as readonly string[]).includes(status);
}

export function deriveBookingApprovalPhase(input: {
  status: string;
  hasPendingPaymentProof: boolean;
  hasActiveReserve?: boolean;
}): BookingApprovalPhase {
  if (input.hasActiveReserve) return 'approved';
  if (isApprovedBookingStatus(input.status)) return 'approved';
  if (input.status === 'draft' || isTerminalBookingLifecycleStatus(input.status)) {
    return 'inactive';
  }
  if (input.status === 'pending_approval' || input.hasPendingPaymentProof) {
    return 'awaiting_admin_approval';
  }
  if (input.status === 'pending_payment') return 'awaiting_payment';
  return 'inactive';
}

export async function bookingHasPendingPaymentProof(bookingId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: pgPaymentRecords.id })
    .from(pgPaymentRecords)
    .where(
      and(
        eq(pgPaymentRecords.bookingId, bookingId),
        eq(pgPaymentRecords.status, 'pending'),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Resident billing dashboard unlocks only for active confirmed non-reserve stays. */
export async function isResidentDashboardUnlocked(customerId: string): Promise<boolean> {
  const { customerHasResidentPortalAccess } = await import(
    '@/src/lib/residents/residentPortalAccess'
  );
  return customerHasResidentPortalAccess(customerId);
}

/**
 * Move booking into explicit admin-review state after customer submits UPI proof.
 */
export async function markBookingAwaitingApproval(bookingId: string): Promise<void> {
  await db
    .update(bookings)
    .set({ status: 'pending_approval', updatedAt: new Date() })
    .where(
      and(eq(bookings.id, bookingId), inArray(bookings.status, ['pending_payment'])),
    );
}

/**
 * Rejection cleanup — release holds and remove any premature billing artefacts.
 */
/** End open-ended stays when a pre-approval booking is rejected — prevents ghost calendar occupancy. */
async function closePrimaryStayRangesOnRejection(
  bookingId: string,
  cancelEndExclusiveIso: string,
  executor: DbExecutor = db,
): Promise<void> {
  await executor.execute(sql`
    UPDATE bed_reservations br
    SET
      stay_range = daterange(
        lower(br.stay_range),
        GREATEST(lower(br.stay_range)::date + 1, ${cancelEndExclusiveIso}::date),
        '[)'
      ),
      updated_at = now()
    WHERE br.booking_id = ${bookingId}::uuid
      AND br.kind = 'primary'
      AND (
        upper(br.stay_range) IS NULL
        OR upper(br.stay_range) > ${cancelEndExclusiveIso}::date
      )
  `);
}

export async function cleanupRejectedBookingRequest(input: {
  bookingId: string;
  reason: string;
  rejectedByAdminId?: string;
  pgPaymentRecordId?: string;
  customerId?: string | null;
  bookingCode?: string | null;
}): Promise<void> {
  const cancelEndExclusiveIso = formatDate(
    new Date(`${todayInBillingTimezone()}T12:00:00Z`),
  );
  // Close stay from the day after rejection in billing TZ (exclusive upper bound).
  const stayUpperExclusive = formatDate(
    new Date(
      Date.UTC(
        Number(cancelEndExclusiveIso.slice(0, 4)),
        Number(cancelEndExclusiveIso.slice(5, 7)) - 1,
        Number(cancelEndExclusiveIso.slice(8, 10)) + 1,
      ),
    ),
  );

  await db.transaction(async (tx) => {
    await tx
      .update(bedReservations)
      .set({ status: 'cancelled', holdExpiresAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(bedReservations.bookingId, input.bookingId),
          inArray(bedReservations.status, ['hold', 'under_review', 'active']),
          eq(bedReservations.kind, 'primary'),
        ),
      );

    await closePrimaryStayRangesOnRejection(input.bookingId, stayUpperExclusive, tx);

    await tx
      .update(bedReserveHolds)
      .set({ status: 'cancelled', holdExpiresAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(bedReserveHolds.bookingId, input.bookingId),
          inArray(bedReserveHolds.status, ['pending_payment', 'under_review', 'active']),
        ),
      );

    await tx
      .update(bookings)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: input.reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bookings.id, input.bookingId),
          inArray(bookings.status, ['draft', 'pending_payment', 'pending_approval']),
        ),
      );

    await tx
      .update(payments)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(
        and(
          eq(payments.bookingId, input.bookingId),
          eq(payments.status, 'succeeded'),
          inArray(payments.purpose, ['bed_reserve', 'booking']),
        ),
      );

    // Defensive — invoices/deposits must not exist pre-approval; cancel if they do.
    await tx
      .update(rentInvoices)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: `booking rejected: ${input.reason}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(rentInvoices.bookingId, input.bookingId),
          inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
        ),
      );

    await tx.insert(auditLog).values({
      actorType: input.rejectedByAdminId ? 'admin' : 'system',
      actorId: input.rejectedByAdminId ?? null,
      entity: 'booking',
      entityId: input.bookingId,
      action: 'payment_proof_rejected',
      diff: {
        reason: input.reason,
        pgPaymentRecordId: input.pgPaymentRecordId ?? null,
        bookingCode: input.bookingCode ?? null,
      },
    });

    const { releaseCouponReservationForBooking } = await import('@/src/services/couponLifecycle');
    await releaseCouponReservationForBooking(input.bookingId, 'payment_proof_rejected', tx);
    const { reverseReferralOnBookingCancel } = await import('@/src/services/referrals');
    await reverseReferralOnBookingCancel(input.bookingId, tx);
  });

  if (input.customerId && input.bookingCode) {
    const { notifyPaymentProofRejected } = await import('@/src/lib/email/notifications');
    notifyPaymentProofRejected({
      customerId: input.customerId,
      bookingCode: input.bookingCode,
      reason: input.reason,
    });
  }

  const { reconcileBookingOccupancy } = await import('@/src/lib/occupancySync');
  await reconcileBookingOccupancy(input.bookingId);
}

export type ReinstateRejectedBookingResult =
  | { ok: true; bookingId: string; bookingCode: string }
  | { ok: false; reason: string };

/**
 * Restore a booking cancelled by payment-proof rejection so admin can re-review
 * the pending pg_payment_record (reviewPaymentRecord approve path).
 */
export async function reinstateRejectedBookingRequest(input: {
  bookingId: string;
  reinstatedByAdminId: string;
  reason: string;
}): Promise<ReinstateRejectedBookingResult> {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      status: bookings.status,
      customerId: bookings.customerId,
      billingAnchorDate: bookings.billingAnchorDate,
      durationMode: bookings.durationMode,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  if (!booking) return { ok: false, reason: 'Booking not found.' };
  if (booking.status === 'confirmed') {
    const [activeRes] = await db
      .select({ id: bedReservations.id })
      .from(bedReservations)
      .where(
        and(
          eq(bedReservations.bookingId, input.bookingId),
          eq(bedReservations.kind, 'primary'),
          eq(bedReservations.status, 'active'),
        ),
      )
      .limit(1);
    if (activeRes) {
      return { ok: true, bookingId: booking.id, bookingCode: booking.bookingCode };
    }
  }
  if (booking.status !== 'cancelled') {
    return { ok: false, reason: `Booking is ${booking.status}, not cancelled.` };
  }

  const [rejectionAudit] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entity, 'booking'),
        eq(auditLog.entityId, input.bookingId),
        eq(auditLog.action, 'payment_proof_rejected'),
      ),
    )
    .limit(1);
  if (!rejectionAudit) {
    return {
      ok: false,
      reason: 'No payment_proof_rejected audit — use the correct booking lifecycle repair.',
    };
  }

  const [reservation] = await db
    .select({
      id: bedReservations.id,
      bedId: bedReservations.bedId,
      status: bedReservations.status,
    })
    .from(bedReservations)
    .where(
      and(eq(bedReservations.bookingId, input.bookingId), eq(bedReservations.kind, 'primary')),
    )
    .limit(1);
  if (!reservation) return { ok: false, reason: 'Primary reservation not found.' };
  if (reservation.status !== 'cancelled') {
    return {
      ok: false,
      reason: `Primary reservation is ${reservation.status}, expected cancelled.`,
    };
  }

  const [conflict] = await db.execute<{ booking_code: string }>(sql`
    SELECT bk.booking_code
    FROM bed_reservations br
    INNER JOIN bookings bk ON bk.id = br.booking_id
    WHERE br.bed_id = ${reservation.bedId}::uuid
      AND br.booking_id <> ${input.bookingId}::uuid
      AND br.kind = 'primary'
      AND br.status IN ('hold', 'under_review', 'active')
      AND bk.status IN ('pending_payment', 'pending_approval', 'confirmed')
      AND CURRENT_DATE <@ br.stay_range
    LIMIT 1
  `);
  if (conflict) {
    return {
      ok: false,
      reason: `Bed is blocked by booking ${conflict.booking_code}.`,
    };
  }

  const anchorIso = booking.billingAnchorDate
    ? formatDate(new Date(`${String(booking.billingAnchorDate).slice(0, 10)}T12:00:00Z`))
    : todayInBillingTimezone();
  const isOpenEnded =
    booking.durationMode === 'open_ended' || booking.durationMode === 'monthly';
  const stayRangeSql = isOpenEnded
    ? sql`daterange(${anchorIso}::date, NULL, '[)')`
    : sql`daterange(${anchorIso}::date, NULL, '[)')`;

  await db.transaction(async (tx) => {
    await tx
      .update(bookings)
      .set({
        status: 'pending_approval',
        cancelledAt: null,
        cancellationReason: null,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, input.bookingId));

    await tx
      .update(bedReservations)
      .set({
        status: 'under_review',
        stayRange: stayRangeSql,
        holdExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(bedReservations.id, reservation.id));

    await tx
      .update(customers)
      .set({ residencyStatus: 'active', updatedAt: new Date() })
      .where(
        and(eq(customers.id, booking.customerId), eq(customers.residencyStatus, 'vacated')),
      );

    await tx.insert(auditLog).values({
      actorType: 'admin',
      actorId: input.reinstatedByAdminId,
      entity: 'booking',
      entityId: input.bookingId,
      action: 'reinstated_after_proof_rejection',
      diff: {
        reason: input.reason,
        bookingCode: booking.bookingCode,
        toStatus: 'pending_approval',
        reservationStatus: 'under_review',
      },
    });
  });

  const { reconcileBookingOccupancy } = await import('@/src/lib/occupancySync');
  await reconcileBookingOccupancy(input.bookingId);

  return { ok: true, bookingId: booking.id, bookingCode: booking.bookingCode };
}
