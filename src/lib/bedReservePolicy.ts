/** Bed reserve (50% rent hold) business constants. */

/** Non-refundable reservation fee = 50% of optimized fixed-stay rent for the reserve window. */
export const RESERVE_FEE_PERCENT = 50;

/** Days kept empty for cleaning before the reserve holder's check-in date. */
export const RESERVE_CLEANING_BUFFER_DAYS = 1;

/** Days after notice/vacating ends before reserve can start on a notice bed. */
export const RESERVE_NOTICE_BUFFER_DAYS = 1;

/** Minimum nights between reserve start and check-in (includes buffer day). */
export const RESERVE_MIN_PERIOD_DAYS = 2;

/** Maximum reserve window from start to check-in. */
export const RESERVE_MAX_PERIOD_DAYS = 90;

export function reserveFeePaise(optimizedRentPaise: number): number {
  if (optimizedRentPaise <= 0) return 0;
  return Math.round((optimizedRentPaise * RESERVE_FEE_PERCENT) / 100);
}

/** Last calendar day short-term guests may occupy before cleaning buffer. */
export function reserveBufferDate(checkInDate: string): string {
  const d = new Date(`${checkInDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - RESERVE_CLEANING_BUFFER_DAYS);
  return d.toISOString().slice(0, 10);
}

/** Exclusive checkout cap for daily/weekly during an active reserve (half-open end). */
export function reserveShortStayEndExclusive(checkInDate: string): string {
  return reserveBufferDate(checkInDate);
}
