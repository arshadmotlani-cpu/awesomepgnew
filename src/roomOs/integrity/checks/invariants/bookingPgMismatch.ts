/**
 * INV_BOOKING_PG_MISMATCH — booking must belong to scoped pgId.
 */

import type { InvariantFinding, PreflightCheckContext } from '@/src/roomOs/integrity/types';
import {
  bookingBelongsToPg,
  resolvePgIdForBooking,
} from '@/src/roomOs/integrity/checks/readers/resolvePgForRoom';

export async function checkBookingPgMismatch(
  ctx: PreflightCheckContext,
): Promise<InvariantFinding[]> {
  if (!ctx.scope.bookingId) return [];

  const belongs = await bookingBelongsToPg(ctx.scope.bookingId, ctx.scope.pgId);
  if (belongs) return [];

  const resolvedPgId = await resolvePgIdForBooking(ctx.scope.bookingId);
  return [
    {
      kind: 'booking_status',
      severity: 'block',
      reasonCode: 'INV_BOOKING_PG_MISMATCH',
      description: `Booking ${ctx.scope.bookingId} is not in property ${ctx.scope.pgId}.`,
      context: {
        bookingId: ctx.scope.bookingId,
        scopePgId: ctx.scope.pgId,
        resolvedPgId,
      },
    },
  ];
}
