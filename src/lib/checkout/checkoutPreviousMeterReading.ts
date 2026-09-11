/**
 * Checkout settlement — auto previous meter reading from room electricity SSOT.
 */
import type { RoomPreviousMeterSource } from '@/src/lib/billing/roomMeterReadingSsot';
import { firstOfMonth } from '@/src/services/billing';
import { describeMeterBaselineSource } from '@/src/services/meterTimelineService';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';

export type ResolvedCheckoutPreviousMeterReading = {
  previousReadingUnits: number | null;
  source: RoomPreviousMeterSource;
  sourceLabel: string;
  lastBillingMonth: string | null;
  ratePerUnitPaise: number;
  /** True when a real prior reading exists (never fabricate 0). */
  available: boolean;
};

/** Latest valid room meter baseline before the vacating consumption month. */
export async function resolveCheckoutPreviousMeterReading(
  roomId: string,
  vacatingDate: string,
): Promise<ResolvedCheckoutPreviousMeterReading> {
  const beforeBillingMonth = firstOfMonth(vacatingDate);
  const baseline = await resolveRoomPreviousMeterReading(roomId, {
    beforeBillingMonth,
    enforceContinuity: false,
  });
  const available = baseline.source !== 'none';
  return {
    previousReadingUnits: available ? baseline.previousReadingUnits : null,
    source: baseline.source,
    sourceLabel: describeMeterBaselineSource(baseline.source),
    lastBillingMonth: baseline.lastBillingMonth,
    ratePerUnitPaise: baseline.ratePerUnitPaise,
    available,
  };
}
