/**
 * Pick the current primary stay row for a booking.
 * Occupancy SSOT: active + today in stay_range wins; never lowest bed UUID.
 */
export type PrimaryStayCandidate = {
  bedId: string;
  status: string;
  inStayToday: boolean;
  upcomingMonthly: boolean;
  stayStart: string;
};

export function stayRank(row: PrimaryStayCandidate): number {
  if (row.status === 'active' && row.inStayToday) return 3;
  if (row.status === 'active' && row.upcomingMonthly) return 2;
  if (row.status === 'active') return 1;
  return 0;
}

export function pickAuthoritativePrimaryStay<T extends PrimaryStayCandidate>(
  rows: T[],
): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const rankDelta = stayRank(b) - stayRank(a);
    if (rankDelta !== 0) return rankDelta;
    return b.stayStart.localeCompare(a.stayStart);
  })[0]!;
}
