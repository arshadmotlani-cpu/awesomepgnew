import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices } from '@/src/db/schema';
import { formatDate } from '@/src/lib/format';
import { invoiceDetailHref } from '@/src/lib/billing/invoiceRoutes';

export type ResidentDocumentInvoiceRow = {
  id: string;
  invoiceNumber: string;
  amountPaise: number;
  issuedAt: string | null;
  stayLabel: string | null;
  label: string;
  status: string;
  detailHref: string;
};

/**
 * Document-only financial invoices for the resident Invoices tab.
 * Visible to the resident for PDF download/share; excluded from accounting elsewhere.
 */
export async function listResidentDocumentInvoicesForCustomer(
  customerId: string,
): Promise<ResidentDocumentInvoiceRow[]> {
  const rows = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      amountPaise: financialInvoices.amountPaise,
      createdAt: financialInvoices.createdAt,
      breakdown: financialInvoices.breakdown,
      status: financialInvoices.status,
    })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.customerId, customerId),
        eq(financialInvoices.isDocumentOnly, true),
        inArray(financialInvoices.status, ['settled', 'paid', 'sent']),
      ),
    )
    .orderBy(desc(financialInvoices.createdAt));

  return rows.map((row) => {
    const meta = row.breakdown?.documentOnly ?? null;
    const stayLabel =
      meta?.stayStart && meta?.stayEnd
        ? `${formatDate(meta.stayStart)} – ${formatDate(meta.stayEnd)}`
        : null;
    return {
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      amountPaise: row.amountPaise,
      issuedAt: row.createdAt ? formatDate(row.createdAt) : null,
      stayLabel,
      label: stayLabel
        ? `Tax Invoice · Accommodation (${stayLabel})`
        : 'Tax Invoice · Accommodation',
      status: 'paid',
      detailHref: invoiceDetailHref(row.id, 'resident'),
    };
  });
}
