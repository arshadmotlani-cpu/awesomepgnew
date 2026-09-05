/**
 * Historical room occupancy slices for checkout electricity allocation.
 * Reuses monthly electricity SSOT — same-room bed changes coalesce; completed stays included.
 */
import type { RoomOccupantSlice } from '@/src/lib/checkout/roomElectricityAllocation';
import { activeDaysInPeriod } from '@/src/lib/checkout/roomElectricityAllocation';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { firstOfMonth } from '@/src/services/billing';

/** Map historical monthly coverage to checkout period slices (room-level, not bed-level). */
export async function loadHistoricalRoomOccupantSlicesForPeriod(input: {
  roomId: string;
  periodStart: string;
  periodEndExclusive: string;
}): Promise<RoomOccupantSlice[]> {
  const billingMonth = firstOfMonth(input.periodStart);
  const load = await loadRoomElectricityOccupantsForMonth({
    roomId: input.roomId,
    billingMonth,
    includeFixedStay: true,
    useProRataByActiveDays: true,
  });

  const slices: RoomOccupantSlice[] = [];
  for (const occupant of load.occupants) {
    let stayStart: string | null = null;
    let stayEndExclusive: string | null = null;

    for (const interval of occupant.intervals) {
      const days = activeDaysInPeriod(
        interval.startDate,
        interval.endDateExclusive,
        input.periodStart,
        input.periodEndExclusive,
      );
      if (days <= 0) continue;
      if (!stayStart || interval.startDate < stayStart) stayStart = interval.startDate;
      const intervalEnd = interval.endDateExclusive ?? input.periodEndExclusive;
      if (!stayEndExclusive || intervalEnd > stayEndExclusive) stayEndExclusive = intervalEnd;
    }

    if (!stayStart) continue;
    slices.push({
      bookingId: occupant.bookingId,
      customerId: occupant.customerId,
      customerName: occupant.customerName ?? 'Resident',
      stayStart,
      stayEndExclusive,
    });
  }

  return slices;
}
