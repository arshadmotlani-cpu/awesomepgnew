import { generateInvoicePdf, invoicePdfFilename } from '@/src/lib/billing/invoicePdf';
import { getInvoiceDocumentDetail } from '@/src/lib/billing/invoiceDocumentModel';
import { resolveFinancialInvoiceRef } from '@/src/lib/billing/resolveFinancialInvoiceRef';

export { invoicePdfDownloadHref, invoicePdfShareDownloadHref } from '@/src/lib/billing/invoicePdfLinks';

export async function loadInvoicePdfBytes(
  invoiceId: string,
): Promise<{ bytes: Uint8Array; filename: string; invoiceNumber: string } | null> {
  const document = await getInvoiceDocumentDetail(invoiceId);
  if (!document) return null;
  const bytes = await generateInvoicePdf(document);
  return {
    bytes,
    filename: invoicePdfFilename(document.invoiceNumber),
    invoiceNumber: document.invoiceNumber,
  };
}

export async function loadInvoicePdfBytesByRef(
  ref: string,
): Promise<{ bytes: Uint8Array; filename: string; invoiceNumber: string; invoiceId: string } | null> {
  const resolved = await resolveFinancialInvoiceRef(ref);
  if (!resolved) return null;
  const loaded = await loadInvoicePdfBytes(resolved.id);
  if (!loaded) return null;
  return { ...loaded, invoiceId: resolved.id };
}

export function invoicePdfResponse(
  bytes: Uint8Array,
  filename: string,
): Response {
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
