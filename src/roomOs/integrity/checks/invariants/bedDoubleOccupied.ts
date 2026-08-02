/**
 * INV_BED_DOUBLE_OCCUPIED — target bed has conflicting active booking.
 */

import { listActiveBookingIdsOnBed } from '@/src/roomOs/integrity/checks/duplicates/primaryReservations';
import type { InvariantFinding, PreflightCheckContext } from '@/src/roomOs/integrity/types';

export async function checkBedDoubleOccupied(
  ctx: PreflightCheckContext,
): Promise<InvariantFinding[]> {
  if (!ctx.scope.bedId) return [];

  const activeBookingIds = await listActiveBookingIdsOnBed(ctx.scope.bedId);
  if (activeBookingIds.length === 0) return [];

  const scopeBookingId = ctx.scope.bookingId;
  const conflictingIds =
    scopeBookingId != null
      ? activeBookingIds.filter((id) => id !== scopeBookingId)
      : activeBookingIds;

  if (conflictingIds.length === 0) return [];

  return [
    {
      kind: 'occupancy',
      severity: 'block',
      reasonCode: 'INV_BED_DOUBLE_OCCUPIED',
      description: `Bed ${ctx.scope.bedId} has ${conflictingIds.length} conflicting active booking(s).`,
      context: {
        bedId: ctx.scope.bedId,
        conflictingBookingIds: conflictingIds,
        scopeBookingId: scopeBookingId ?? null,
      },
    },
  ];
}
