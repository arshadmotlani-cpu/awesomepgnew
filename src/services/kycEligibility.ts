import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, bookings } from '@/src/db/schema';

export type CustomerKycUploadContext = {
  /** Customer may upload / resubmit KYC documents. */
  mayUpload: boolean;
  /** Has a booking awaiting payment or admin payment approval. */
  hasPendingPaymentBooking: boolean;
  /** Has a confirmed booking (paid / admin-assigned). */
  hasConfirmedBooking: boolean;
  /** Active long-term stay (admin assign or confirmed tenant). */
  hasActiveTenancy: boolean;
  /** Show check-in oriented copy (booking or active stay). */
  kycForCheckIn: boolean;
};

/**
 * Who can upload KYC: anyone with an active relationship to the PG —
 * confirmed booking, pending payment, or active bed assignment — plus
 * signed-in users completing profile (walk-in / pre-book).
 */
export async function getCustomerKycUploadContext(
  customerId: string,
  bookingCode?: string,
): Promise<CustomerKycUploadContext> {
  const [bookingRow] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(
      and(
        eq(bookings.customerId, customerId),
        inArray(bookings.status, ['pending_payment', 'pending_approval', 'confirmed']),
      ),
    )
    .orderBy(sql`CASE WHEN ${bookings.status} = 'confirmed' THEN 0 ELSE 1 END`)
    .limit(1);

  const hasPendingPaymentBooking =
    bookingRow?.status === 'pending_payment' || bookingRow?.status === 'pending_approval';
  const hasConfirmedBooking = bookingRow?.status === 'confirmed';

  const [tenancyRow] = await db
    .select({ bookingId: bookings.id })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.customerId, customerId),
        eq(bookings.status, 'confirmed'),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    )
    .limit(1);

  const hasActiveTenancy = Boolean(tenancyRow);
  const kycForCheckIn = Boolean(
    bookingCode || hasConfirmedBooking || hasPendingPaymentBooking || hasActiveTenancy,
  );

  return {
    mayUpload: true,
    hasPendingPaymentBooking,
    hasConfirmedBooking,
    hasActiveTenancy,
    kycForCheckIn,
  };
}
