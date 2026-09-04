/**
 * Resolve the half-open electricity occupancy end for a reservation segment.
 *
 * Stay-range upper is preferred when present, but completed/approved vacating
 * (and terminal expected checkout when the range was left open) must clamp
 * open-ended ranges so former residents stop receiving room-day liability.
 */
import { stayRangeExclusiveEnd } from '@/src/lib/vacating/vacatingBedSemantics';
import { tryParseDateBound } from '@/src/lib/dates';

export function resolveElectricityStayEndExclusive(input: {
  stayRangeUpper: string | null | undefined;
  vacatingDate?: string | null;
  expectedCheckoutDate?: string | null;
  reservationStatus: string;
  bookingStatus: string;
}): string | null {
  const ends: string[] = [];

  const stayUpper = tryParseDateBound(input.stayRangeUpper ?? null);
  if (stayUpper) ends.push(stayUpper);

  const vacatingDate = tryParseDateBound(input.vacatingDate ?? null);
  if (vacatingDate) ends.push(stayRangeExclusiveEnd(vacatingDate));

  const isTerminal =
    input.reservationStatus === 'completed' ||
    input.bookingStatus === 'completed' ||
    input.bookingStatus === 'superseded';

  const expectedCheckout = tryParseDateBound(input.expectedCheckoutDate ?? null);
  if (!stayUpper && isTerminal && expectedCheckout) {
    ends.push(stayRangeExclusiveEnd(expectedCheckout));
  }

  if (ends.length === 0) return null;
  ends.sort();
  return ends[0] ?? null;
}
