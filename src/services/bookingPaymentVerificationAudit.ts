/**
 * Load read-only checkout payment verification audit for a booking detail page.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, paymentProofRejections, pgPaymentRecords } from '@/src/db/schema';
import {
  buildBookingPaymentVerificationAudit,
  type BookingPaymentVerificationAudit,
} from '@/src/lib/billing/bookingPaymentVerificationAudit';

export async function loadBookingPaymentVerificationAudit(
  bookingId: string,
): Promise<BookingPaymentVerificationAudit | null> {
  const [booking] = await db
    .select({
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) return null;

  const [approved] = await db
    .select({
      id: pgPaymentRecords.id,
      proofSnapshotSubmittedPaise: pgPaymentRecords.proofSnapshotSubmittedPaise,
      confirmedAmountPaise: pgPaymentRecords.confirmedAmountPaise,
      amountPaise: pgPaymentRecords.amountPaise,
      paymentScreenshotUrl: pgPaymentRecords.paymentScreenshotUrl,
    })
    .from(pgPaymentRecords)
    .where(and(eq(pgPaymentRecords.bookingId, bookingId), eq(pgPaymentRecords.status, 'approved')))
    .orderBy(desc(pgPaymentRecords.reviewedAt), desc(pgPaymentRecords.updatedAt))
    .limit(1);

  if (approved) {
    return buildBookingPaymentVerificationAudit({
      recordId: approved.id,
      status: 'approved',
      booking,
      proofRecord: approved,
    });
  }

  const [rejection] = await db
    .select({
      entityId: paymentProofRejections.entityId,
      proofSnapshotSubmittedPaise: pgPaymentRecords.proofSnapshotSubmittedPaise,
      confirmedAmountPaise: pgPaymentRecords.confirmedAmountPaise,
      amountPaise: pgPaymentRecords.amountPaise,
      paymentScreenshotUrl: pgPaymentRecords.paymentScreenshotUrl,
    })
    .from(paymentProofRejections)
    .innerJoin(pgPaymentRecords, eq(pgPaymentRecords.id, paymentProofRejections.entityId))
    .where(
      and(
        eq(paymentProofRejections.bookingId, bookingId),
        eq(paymentProofRejections.entityType, 'pg_payment_record'),
      ),
    )
    .orderBy(desc(paymentProofRejections.rejectedAt))
    .limit(1);

  if (!rejection) return null;

  return buildBookingPaymentVerificationAudit({
    recordId: rejection.entityId,
    status: 'rejected',
    booking,
    proofRecord: rejection,
  });
}
