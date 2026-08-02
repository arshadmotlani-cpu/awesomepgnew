/**
 * INV_DEPOSIT_NOT_FULLY_HELD — deposit constraint for rent-only onboarding.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import type { InvariantFinding, PreflightCheckContext } from '@/src/roomOs/integrity/types';

export async function checkDepositFullyHeld(
  ctx: PreflightCheckContext,
): Promise<InvariantFinding[]> {
  if (!ctx.scope.bookingId) return [];
  if (!ctx.scope.constraints?.depositAlreadyHeld) return [];

  const [booking] = await db
    .select({
      depositPaise: bookings.depositPaise,
    })
    .from(bookings)
    .where(eq(bookings.id, ctx.scope.bookingId))
    .limit(1);
  if (!booking) return [];

  const summary = await getDepositSummaryForBooking(ctx.scope.bookingId);
  const requiredPaise = booking.depositPaise;
  const collectedPaise = summary?.collectedPaise ?? 0;
  const outstandingPaise = Math.max(0, requiredPaise - collectedPaise);

  if (outstandingPaise <= 0) return [];

  return [
    {
      kind: 'deposit',
      severity: 'block',
      reasonCode: 'INV_DEPOSIT_NOT_FULLY_HELD',
      description: `Deposit not fully held: outstanding ${outstandingPaise} paise of ${requiredPaise} required.`,
      context: {
        bookingId: ctx.scope.bookingId,
        requiredPaise,
        collectedPaise,
        outstandingPaise,
      },
    },
  ];
}
