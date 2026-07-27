/**
 * Document-only financial invoices (e.g. company reimbursement) must never affect
 * command-center counts, SSOT outstanding, revenue, or analytics.
 */
import { sql } from 'drizzle-orm';
import { financialInvoices } from '@/src/db/schema';

export function excludeDocumentOnlyFinancialInvoices() {
  return sql`${financialInvoices.isDocumentOnly} = false`;
}

export function isCompanyReimbursementInvoice(invoice: {
  invoiceType?: string | null;
  isDocumentOnly?: boolean | null;
}): boolean {
  return (
    invoice.invoiceType === 'company_reimbursement' || Boolean(invoice.isDocumentOnly)
  );
}
