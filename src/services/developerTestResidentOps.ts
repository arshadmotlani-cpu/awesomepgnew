import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, checkoutSettlements, customers, kycSubmissions, vacatingRequests } from '@/src/db/schema';
import { todayString } from '@/src/lib/dates';

export async function reopenRefundSettlementForCustomer(input: {
  customerId: string;
  bookingId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [settlement] = await db
    .select({ id: checkoutSettlements.id })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.bookingId, input.bookingId),
        eq(checkoutSettlements.customerId, input.customerId),
      ),
    )
    .orderBy(desc(checkoutSettlements.updatedAt))
    .limit(1);

  if (!settlement) return { ok: false, error: 'No checkout settlement found for this booking.' };

  await db
    .update(checkoutSettlements)
    .set({
      status: 'awaiting_resident_details',
      amountsLocked: false,
      refundNotes: null,
      updatedAt: new Date(),
    })
    .where(eq(checkoutSettlements.id, settlement.id));

  return { ok: true };
}

export async function ensureApprovedVacatingForDeveloperTest(input: {
  customerId: string;
  bookingId: string;
}): Promise<void> {
  const [active] = await db
    .select({ id: vacatingRequests.id })
    .from(vacatingRequests)
    .where(
      and(
        eq(vacatingRequests.bookingId, input.bookingId),
        inArray(vacatingRequests.status, ['pending', 'approved']),
      ),
    )
    .limit(1);

  if (active) {
    await db
      .update(vacatingRequests)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(eq(vacatingRequests.id, active.id));
    return;
  }

  const [booking] = await db
    .select({ depositPaise: bookings.depositPaise })
    .from(bookings)
    .where(and(eq(bookings.id, input.bookingId), eq(bookings.customerId, input.customerId)))
    .limit(1);
  if (!booking) return;

  const vacatingDate = todayString();
  await db.insert(vacatingRequests).values({
    bookingId: input.bookingId,
    customerId: input.customerId,
    noticeGivenDate: vacatingDate,
    vacatingDate,
    noticeCompliant: true,
    deductionPaise: 0,
    depositRefundPaise: booking.depositPaise,
    monthlyRentPaiseSnapshot: 0,
    status: 'approved',
  });
}

export async function setCustomerKycPending(customerId: string): Promise<void> {
  await db
    .update(customers)
    .set({ kycStatus: 'pending', updatedAt: new Date() })
    .where(eq(customers.id, customerId));
}

export async function setCustomerKycRejected(customerId: string): Promise<void> {
  const [latest] = await db
    .select({ id: kycSubmissions.id })
    .from(kycSubmissions)
    .where(eq(kycSubmissions.customerId, customerId))
    .orderBy(desc(kycSubmissions.createdAt))
    .limit(1);

  if (latest) {
    await db
      .update(kycSubmissions)
      .set({
        status: 'rejected',
        rejectionReason: 'Developer test — resubmit to exercise the flow.',
        updatedAt: new Date(),
      })
      .where(eq(kycSubmissions.id, latest.id));
  }

  await db
    .update(customers)
    .set({ kycStatus: 'rejected', updatedAt: new Date() })
    .where(eq(customers.id, customerId));
}

export async function clearRejectedVacatingForBooking(input: {
  customerId: string;
  bookingId: string;
}): Promise<void> {
  await db
    .delete(vacatingRequests)
    .where(
      and(
        eq(vacatingRequests.bookingId, input.bookingId),
        eq(vacatingRequests.customerId, input.customerId),
        eq(vacatingRequests.status, 'rejected'),
      ),
    );
}

export async function archiveActiveCheckoutSettlement(input: {
  customerId: string;
  bookingId: string;
}): Promise<void> {
  await db
    .update(checkoutSettlements)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(
      and(
        eq(checkoutSettlements.bookingId, input.bookingId),
        eq(checkoutSettlements.customerId, input.customerId),
        inArray(checkoutSettlements.status, [
          'awaiting_resident_details',
          'awaiting_admin_review',
          'approved',
          'refund_pending',
        ]),
      ),
    );
}
