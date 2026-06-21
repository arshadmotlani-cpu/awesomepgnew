/**
 * Reverse booking / occupancy effects when an invoice is cancelled or refunded.
 * Cancelled invoices must not affect revenue, occupancy, or dashboard metrics.
 */

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers, financialInvoices } from '@/src/db/schema';
import { reconcileBookingOccupancy } from '@/src/lib/occupancySync';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import { cancelBooking } from '@/src/services/bookingLifecycle';

const ACTIVE_FINANCIAL_STATUSES = ['draft', 'sent', 'overdue', 'paid', 'partial', 'payment_in_progress'] as const;

async function bookingHasActiveFinancialInvoices(bookingId: string, excludeInvoiceId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: financialInvoices.id })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.bookingId, bookingId),
        inArray(financialInvoices.status, [...ACTIVE_FINANCIAL_STATUSES]),
        excludeInvoiceId ? ne(financialInvoices.id, excludeInvoiceId) : sql`true`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** When the last active invoice for an admin walk-in booking is cancelled, free the bed. */
export async function reverseBookingEffectsIfInvoiceVoided(input: {
  invoiceId: string;
  bookingId: string | null;
  customerId: string;
  reason: string;
  actorId?: string | null;
}): Promise<void> {
  if (!input.bookingId) return;

  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      status: bookings.status,
      createdVia: bookings.createdVia,
      customerId: bookings.customerId,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  if (!booking || booking.status !== 'confirmed' || booking.createdVia !== 'admin') {
    return;
  }

  const stillActive = await bookingHasActiveFinancialInvoices(input.bookingId, input.invoiceId);
  if (stillActive) return;

  const cancelled = await cancelBooking({
    bookingCode: booking.bookingCode,
    reason: `[invoice void] ${input.reason}`,
    actor: input.actorId
      ? { kind: 'admin', adminId: input.actorId }
      : { kind: 'system', note: 'invoice void reversal' },
  });

  if (!cancelled.ok) {
    console.warn('[invoiceLifecycleReversal] booking cancel skipped:', cancelled.reason);
    return;
  }

  const tenancy = await getActiveTenancyForCustomer(booking.customerId);
  if (!tenancy || tenancy.bookingId === booking.id) {
    await db
      .update(customers)
      .set({ residencyStatus: 'vacated', updatedAt: new Date() })
      .where(eq(customers.id, booking.customerId));
  }

  await reconcileBookingOccupancy(booking.id);
}
