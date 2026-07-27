/**
 * Pure company-reimbursement copy/helpers — safe for client components.
 * Keep DB/service imports out of this file.
 */

export const COMPANY_REIMBURSEMENT_FOOTER =
  'This invoice is issued solely for reimbursement purposes and does not represent accounting revenue in the Awesome PG system.';

/** Round only for display; invoice total stays exact. */
export function displayRatePerDayPaise(totalPaise: number, durationDays: number): number {
  if (durationDays <= 0) return totalPaise;
  return Math.round(totalPaise / durationDays);
}
