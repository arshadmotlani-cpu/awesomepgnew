/**
 * Document-only accommodation invoice copy — safe for client components.
 * Keep DB/service imports out of this file.
 *
 * These invoices are non-accounting (isDocumentOnly / excludeFromReports) but
 * present to residents as a normal professional tax invoice for hotel stay.
 */

export const DOCUMENT_ONLY_INVOICE_TITLE = 'Tax Invoice';

export const DOCUMENT_ONLY_PAYMENT_STATUS = 'Paid';

export const DOCUMENT_ONLY_INVOICE_FOOTER =
  'Thank you for choosing Awesome PG Hotel for your stay. This tax invoice is issued for hotel accommodation charges.';

/** @deprecated Use DOCUMENT_ONLY_INVOICE_FOOTER — kept for import compatibility. */
export const COMPANY_REIMBURSEMENT_FOOTER = DOCUMENT_ONLY_INVOICE_FOOTER;

export function hotelAccommodationLineLabel(
  durationDays: number,
  ratePerDayPaise: number,
): string {
  const rate = (ratePerDayPaise / 100).toFixed(2);
  return `Hotel Accommodation — ${durationDays} day${durationDays === 1 ? '' : 's'} @ Rs. ${rate}/day`;
}

/** Round only for display; invoice total stays exact. */
export function displayRatePerDayPaise(totalPaise: number, durationDays: number): number {
  if (durationDays <= 0) return totalPaise;
  return Math.round(totalPaise / durationDays);
}
