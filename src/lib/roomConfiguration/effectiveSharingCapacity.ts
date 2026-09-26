/**
 * Pure financial sharing capacity — room configuration schedule vs physical beds.
 */

export type RoomConfigScheduleSlice = {
  effectiveFrom: string;
  targetBedCount: number;
  status: 'scheduled' | 'applied' | 'cancelled';
};

export function scheduleAppliesToFinancialDate(
  schedule: RoomConfigScheduleSlice,
  asOfDate: string,
): boolean {
  return (
    (schedule.status === 'applied' || schedule.status === 'scheduled') &&
    schedule.effectiveFrom <= asOfDate
  );
}

/** Financial/rent/electricity divisor for `asOfDate` (not live physical occupancy). */
export function resolveFinancialSharingBedCount(input: {
  physicalBedCount: number;
  schedule: RoomConfigScheduleSlice | null;
  asOfDate: string;
}): number {
  const { physicalBedCount, schedule, asOfDate } = input;
  if (schedule && scheduleAppliesToFinancialDate(schedule, asOfDate)) {
    return Math.max(1, schedule.targetBedCount);
  }
  return Math.max(0, physicalBedCount);
}
