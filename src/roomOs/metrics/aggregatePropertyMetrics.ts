/**
 * Pure property + room rollups from PropertyOsIndexSnapshot.
 */

import type { PropertyMetricsRollup, PropertyOsIndexSnapshot, RoomMetricsRollup } from '@/src/roomOs/types';

export function aggregatePropertyMetrics(
  propertyIndex: PropertyOsIndexSnapshot,
): { property: PropertyMetricsRollup; rooms: RoomMetricsRollup[] } {
  const kpi = propertyIndex.kpiStrip;
  const property: PropertyMetricsRollup = {
    pgId: propertyIndex.pgId,
    billingMonth: propertyIndex.billingMonth,
    occupancySummary: `${propertyIndex.roomIndex.length} rooms indexed`,
    proofsPending: kpi.proofsPending,
    overdueRent: kpi.overdueRent,
    rentDueToday: kpi.rentDueToday,
    electricityIncomplete: kpi.electricityIncomplete,
    moveOutsPending: kpi.moveOutsPending,
    electricityProgress: propertyIndex.electricityProgress,
    totalWorkQueueItems: propertyIndex.workQueueSummary.totalItems,
    bucketCounts: propertyIndex.workQueueSummary.bucketCounts,
  };

  const rooms: RoomMetricsRollup[] = propertyIndex.roomIndex.map((room) => ({
    roomId: room.roomId,
    label: room.label,
    occupancySummary: room.occupancySummary,
    electricityStatus: room.electricityStatus,
    electricityStatusReason: room.electricityStatusReason,
  }));

  return { property, rooms };
}
