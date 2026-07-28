/**
 * Document-only invoice presentation copy — safe for client components.
 * Keep DB/service imports out of this file.
 *
 * Accounting flags (isDocumentOnly / excludeFromReports) stay server-side;
 * resident-facing copy must look like a normal tax invoice.
 */

export const DOCUMENT_ONLY_INVOICE_TITLE = 'Tax Invoice';

export const DOCUMENT_ONLY_PAYMENT_STATUS = 'Paid';

export const DOCUMENT_ONLY_LINE_LABEL =
  'Accommodation with Breakfast, Lunch & Dinner';

export const DOCUMENT_ONLY_INVOICE_FOOTER =
  'This is a computer-generated tax invoice from Awesome PG. For billing queries, contact your PG office.';

/** @deprecated Use DOCUMENT_ONLY_INVOICE_FOOTER — kept for import compatibility. */
export const COMPANY_REIMBURSEMENT_FOOTER = DOCUMENT_ONLY_INVOICE_FOOTER;

/** Package line label — meals included; never add separate meal line items. */
export function hotelAccommodationLineLabel(
  _durationDays?: number,
  _ratePerDayPaise?: number,
): string {
  return DOCUMENT_ONLY_LINE_LABEL;
}

/** Round only for display; invoice total stays exact. */
export function displayRatePerDayPaise(totalPaise: number, durationDays: number): number {
  if (durationDays <= 0) return totalPaise;
  return Math.round(totalPaise / durationDays);
}
