/**
 * Booking approval lifecycle — gates resident dashboard, invoices, and deposit
 * ledger until admin confirms a submitted booking request (UPI proof reviewed).
 *
 * Flow:
 *   createBooking          → pending_payment (temporary reservation — no admin approval)
 *   submit payment proof   → pending_approval (Waiting For Approval)
 *   admin approves proof   → confirmed (+ active reservations, deposit ledger)
 *   admin rejects proof    → pending_payment (+ hold kept, resident re-uploads)
 *   explicit cancel/timeout → cancelled (+ hold release)
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bedReservations, bookings, pgPaymentRecords, rentInvoices } from '@/src/db/schema';
import { env } from '@/src/lib/env';

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
}): BookingApprovalPhase {
  if (isApprovedBookingStatus(input.status)) return 'approved';
  if (input.status === 'cancelled' || input.status === 'refunded' || input.status === 'draft') {
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

/** Resident billing dashboard unlocks only after admin-approved booking. */
export async function isResidentDashboardUnlocked(customerId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.customerId, customerId), eq(bookings.status, 'confirmed')))
    .limit(1);
  return Boolean(row);
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
 * Reject booking payment proof — keep reservation alive for re-upload (rent-like).
 */
export async function rejectBookingPaymentProof(input: {
  bookingId: string;
  reason: string;
  rejectedByAdminId: string;
  pgPaymentRecordId: string;
  customerId?: string | null;
  bookingCode?: string | null;
}): Promise<void> {
  const holdUntil = new Date(Date.now() + env.BOOKING_REJECT_GRACE_MINUTES * 60 * 1000);

  await db.transaction(async (tx) => {
    await tx
      .update(bookings)
      .set({ status: 'pending_payment', updatedAt: new Date() })
      .where(
        and(
          eq(bookings.id, input.bookingId),
          inArray(bookings.status, ['pending_payment', 'pending_approval']),
        ),
      );

    await tx
      .update(bedReservations)
      .set({ holdExpiresAt: holdUntil, updatedAt: new Date() })
      .where(
        and(
          eq(bedReservations.bookingId, input.bookingId),
          eq(bedReservations.status, 'hold'),
          eq(bedReservations.kind, 'primary'),
        ),
      );

    await tx.insert(auditLog).values({
      actorType: 'admin',
      actorId: input.rejectedByAdminId,
      entity: 'booking',
      entityId: input.bookingId,
      action: 'payment_proof_rejected',
      diff: {
        reason: input.reason,
        pgPaymentRecordId: input.pgPaymentRecordId,
        bookingCode: input.bookingCode ?? null,
      },
    });
  });

  const { scheduleAdminNotificationSync } = await import('@/src/services/adminLiveSync');
  scheduleAdminNotificationSync();

  if (input.customerId && input.bookingCode) {
    const { notifyPaymentProofRejected } = await import('@/src/lib/email/notifications');
    notifyPaymentProofRejected({
      customerId: input.customerId,
      bookingCode: input.bookingCode,
      reason: input.reason,
    });
  }
}

/**
 * Explicit booking cancellation — release holds and remove premature billing artefacts.
 */
export async function cleanupRejectedBookingRequest(input: {
  bookingId: string;
  reason: string;
  rejectedByAdminId?: string;
  pgPaymentRecordId?: string;
  customerId?: string | null;
  bookingCode?: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(bedReservations)
      .set({ status: 'cancelled', holdExpiresAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(bedReservations.bookingId, input.bookingId),
          inArray(bedReservations.status, ['hold', 'active']),
          eq(bedReservations.kind, 'primary'),
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
          inArray(bookings.status, ['pending_payment', 'pending_approval']),
        ),
      );

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
      action: 'booking_cancelled',
      diff: {
        reason: input.reason,
        pgPaymentRecordId: input.pgPaymentRecordId ?? null,
        bookingCode: input.bookingCode ?? null,
      },
    });
  });
}

export async function getLatestRejectedBookingPaymentProof(
  bookingId: string,
  customerId: string,
): Promise<{ id: string; rejectionReason: string | null; reviewedAt: Date | null } | null> {
  const [row] = await db
    .select({
      id: pgPaymentRecords.id,
      rejectionReason: pgPaymentRecords.rejectionReason,
      reviewedAt: pgPaymentRecords.reviewedAt,
    })
    .from(pgPaymentRecords)
    .where(
      and(
        eq(pgPaymentRecords.bookingId, bookingId),
        eq(pgPaymentRecords.customerId, customerId),
        eq(pgPaymentRecords.status, 'rejected'),
      ),
    )
    .orderBy(desc(pgPaymentRecords.reviewedAt), desc(pgPaymentRecords.createdAt))
    .limit(1);
  return row ?? null;
}
