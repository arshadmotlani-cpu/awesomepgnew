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

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  bedReserveHolds,
  bookings,
  payments,
  pgPaymentRecords,
  rentInvoices,
} from '@/src/db/schema';
import { isTerminalBookingLifecycleStatus } from '@/src/lib/booking/bookingStatus';

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
          inArray(bedReservations.status, ['hold', 'under_review', 'active']),
          eq(bedReservations.kind, 'primary'),
        ),
      );

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
  });

  if (input.customerId && input.bookingCode) {
    const { notifyPaymentProofRejected } = await import('@/src/lib/email/notifications');
    notifyPaymentProofRejected({
      customerId: input.customerId,
      bookingCode: input.bookingCode,
      reason: input.reason,
    });
  }
}
