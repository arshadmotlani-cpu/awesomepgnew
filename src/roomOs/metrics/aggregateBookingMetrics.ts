/**
 * Pure booking + resident rollups from property index work queue projection.
 */

import type {
  BookingMetricsRollup,
  PropertyOsIndexSnapshot,
  ResidentMetricsRollup,
  WorkQueueSnapshot,
} from '@/src/roomOs/types';

export function aggregateBookingMetrics(input: {
  propertyIndex: PropertyOsIndexSnapshot;
  workQueue?: WorkQueueSnapshot | null;
}): { bookings: BookingMetricsRollup[]; residents: ResidentMetricsRollup[] } {
  const bookings: BookingMetricsRollup[] = input.propertyIndex.workQueueProjection.bookings.map(
    (booking) => ({
      bookingId: booking.bookingId,
      bookingCode: booking.bookingCode,
      paymentState: booking.paymentState,
      paymentStateReason: booking.paymentStateReason,
      rentStatus: booking.rentStatus,
    }),
  );

  const proofBookingIds = new Set(
    (input.workQueue?.items ?? [])
      .filter((item) => item.bucket === 'proofs' && item.bookingId)
      .map((item) => item.bookingId!),
  );

  const residents: ResidentMetricsRollup[] = input.propertyIndex.workQueueProjection.bookings
    .filter((b) => proofBookingIds.has(b.bookingId) || b.paymentState !== 'clear')
    .map((booking) => ({
      customerId: booking.customerId,
      bookingId: booking.bookingId,
      bookingCode: booking.bookingCode,
      paymentState: booking.paymentState,
      rentStatus: booking.rentStatus,
    }));

  return { bookings, residents };
}
