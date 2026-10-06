/**
 * Unused prepaid rent when a room configuration lowers monthly rent mid-cycle.
 * Reuses room-shift proration SSOT (remainingInBillingMonth).
 */

import { remainingInBillingMonth } from '@/src/services/roomShiftQuote';

export const ROOM_CONFIGURATION_UNUSED_RENT_REASON_PREFIX = 'room_configuration_unused_rent:';

export function roomConfigurationUnusedRentCreditReason(
  scheduleId: string,
  bookingId: string,
): string {
  return `${ROOM_CONFIGURATION_UNUSED_RENT_REASON_PREFIX}${scheduleId}:${bookingId}`;
}

export function computeRoomConfigurationUnusedRentCreditPaise(input: {
  effectiveFrom: string;
  oldMonthlyRentPaise: number;
  newMonthlyRentPaise: number;
  /** True when the active billing month rent invoice is fully paid at the old rate. */
  currentMonthRentIsPaid: boolean;
}): number {
  if (!input.currentMonthRentIsPaid) return 0;
  if (input.newMonthlyRentPaise >= input.oldMonthlyRentPaise) return 0;
  const oldTail = remainingInBillingMonth(input.effectiveFrom, input.oldMonthlyRentPaise);
  const newTail = remainingInBillingMonth(input.effectiveFrom, input.newMonthlyRentPaise);
  return Math.max(0, oldTail - newTail);
}
