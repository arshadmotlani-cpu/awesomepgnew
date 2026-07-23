import type { InvoiceDocumentLetterhead } from '@/src/lib/billing/invoiceDocumentModel';

export function buildFallbackPgLetterhead(pgName: string): InvoiceDocumentLetterhead {
  return {
    businessName: 'Awesome PG',
    pgName,
    addressLines: [pgName],
    gstin: 'GSTIN on request',
    contactPhone: null,
    contactEmail: null,
  };
}
