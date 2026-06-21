/**
 * Financial invoice numbering — INV-{YEAR}-{PROPERTY_CODE}-{SEQUENCE}
 *
 * Pure helpers safe for client and server. DB allocation lives in
 * invoiceNumbering.server.ts.
 *
 * Rent-synced financial rows keep mirroring rent_invoices.invoice_number (RNT-*)
 * for backward compatibility — see syncRentInvoiceToUnified().
 */

/** First segment of PG slug, 3 chars uppercase; name fallback if slug too short. */
export function derivePropertyCode(slug: string, name?: string | null): string {
  const segment = slug.split(/[-_]/)[0]?.replace(/[^a-zA-Z0-9]/g, '') ?? '';
  if (segment.length >= 3) return segment.slice(0, 3).toUpperCase();

  const fromName = (name ?? '').replace(/[^a-zA-Z]/g, '');
  if (fromName.length >= 3) return fromName.slice(0, 3).toUpperCase();
  if (segment.length > 0) return segment.toUpperCase().padEnd(3, 'X');
  if (fromName.length > 0) return fromName.toUpperCase().padEnd(3, 'X');

  return 'PGX';
}

export function invoiceNumberPrefix(year: number, propertyCode: string): string {
  return `INV-${year}-${propertyCode}-`;
}

export function formatInvoiceSequence(sequence: number): string {
  return String(Math.max(1, sequence)).padStart(4, '0');
}

export function buildFinancialInvoiceNumber(
  year: number,
  propertyCode: string,
  sequence: number,
): string {
  return `${invoiceNumberPrefix(year, propertyCode)}${formatInvoiceSequence(sequence)}`;
}

export type NextFinancialInvoiceNumberInput = {
  pgId: string;
  /** Calendar year for sequence scope. Defaults to current UTC year. */
  year?: number;
};

export type FinancialInvoiceSourceRef = {
  sourceTable: string;
  sourceId: string;
};
