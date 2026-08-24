/**
 * Customer-facing PG / room availability badge copy.
 * Counts come from bed occupancy SSOT — do not invent parallel vacancy math.
 */

import { BED_AVAILABLE_FROM_CLOCK } from '@/src/lib/vacating/vacatingBedSemantics';

export type FutureOpeningGroup = {
  /** YYYY-MM-DD when the bed becomes bookable (IST calendar). */
  availableFromDate: string;
  bedCount: number;
};

/** Customer browse dates: day + short month, no year. */
export function formatCustomerDayMonth(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const d = new Date(`${ymd}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** e.g. "25 Aug · 12:00 AM" */
export function formatCustomerAvailableFrom(ymd: string): string {
  return `${formatCustomerDayMonth(ymd)} · ${BED_AVAILABLE_FROM_CLOCK}`;
}

function bedsNoun(n: number): string {
  return n === 1 ? 'bed' : 'beds';
}

export function formatFutureOpeningPhrase(group: FutureOpeningGroup): string {
  const day = formatCustomerDayMonth(group.availableFromDate);
  return `${group.bedCount} ${bedsNoun(group.bedCount)} available from ${day}`;
}

/**
 * Priority:
 * 1. Open now
 * 2. Confirmed future openings (approved vacate / known bookable-from)
 * 3. Fully occupied
 * 4. Maintenance-only inventory
 */
export function formatPublicAvailabilityBadge(input: {
  totalBeds: number;
  openNowBeds: number;
  occupiedBeds?: number;
  reservedBeds?: number;
  maintenanceBeds?: number;
  futureOpenings?: FutureOpeningGroup[];
}): string {
  const total = input.totalBeds;
  const openNow = input.openNowBeds;
  const occupied = input.occupiedBeds ?? 0;
  const reserved = input.reservedBeds ?? 0;
  const maintenance = input.maintenanceBeds ?? 0;
  const openings = input.futureOpenings ?? [];

  if (total <= 0) return 'No beds';

  if (openNow > 0) {
    return openNow === total
      ? `${openNow} ${bedsNoun(openNow)} available`
      : `${openNow} of ${total} beds free today`;
  }

  if (openings.length > 0) {
    return openings.map(formatFutureOpeningPhrase).join(' · ');
  }

  if (maintenance > 0 && occupied + reserved === 0) {
    return `${maintenance} under maintenance`;
  }

  return 'Fully occupied · no beds';
}

/** True when the badge should use the positive “opening soon” highlight. */
export function isFutureAvailabilityBadge(input: {
  openNowBeds: number;
  futureOpenings?: FutureOpeningGroup[];
}): boolean {
  return input.openNowBeds === 0 && (input.futureOpenings?.length ?? 0) > 0;
}
