/**
 * Persist advance rent credit when checkout rent exceeds first-month prorated invoice.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import type { CheckoutRentProration } from '@/src/lib/billing/checkoutRentProration';

export async function recordAdvanceRentCreditFromCheckout(input: {
  bookingId: string;
  paymentId: string;
  proration: CheckoutRentProration;
}): Promise<{ recorded: boolean; amountPaise: number }> {
  if (input.proration.advanceRentCreditPaise <= 0) return { recorded: false, amountPaise: 0 };

  const [booking] = await db
    .select({ pricingSnapshot: bookings.pricingSnapshot })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return { recorded: false, amountPaise: 0 };

  const snapshot = (booking.pricingSnapshot ?? {}) as PricingSnapshot;
  const credits = [...(snapshot.checkoutCredits ?? [])];
  const existing = credits.find(
    (c) =>
      c.kind === 'advance_rent_credit' && c.relatedPaymentId === input.paymentId,
  );
  if (existing) {
    return { recorded: false, amountPaise: existing.amountPaise };
  }

  const note =
    input.proration.daysActive != null && input.proration.daysInMonth != null
      ? `First month pro-rated ${input.proration.daysActive}/${input.proration.daysInMonth} days — credit toward future rent`
      : 'Advance rent credit from checkout payment';

  credits.push({
    amountPaise: input.proration.advanceRentCreditPaise,
    kind: 'advance_rent_credit',
    relatedPaymentId: input.paymentId,
    createdAt: new Date().toISOString(),
    note,
  });

  await db
    .update(bookings)
    .set({
      pricingSnapshot: { ...snapshot, checkoutCredits: credits },
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, input.bookingId));

  await db.insert(auditLog).values({
    actorType: 'system',
    actorId: null,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'advance_rent_credit_from_checkout',
    diff: {
      paymentId: input.paymentId,
      amountPaise: input.proration.advanceRentCreditPaise,
      firstMonthInvoiceRentPaise: input.proration.firstMonthInvoiceRentPaise,
      quotedRentPaise: input.proration.quotedRentPaise,
    },
  });

  return { recorded: true, amountPaise: input.proration.advanceRentCreditPaise };
}
