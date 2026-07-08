import {
  invoicePdfResponse,
  loadInvoicePdfBytes,
} from '@/src/lib/billing/invoicePdfDownload';
import { resolveInvoiceIdByShareToken } from '@/src/lib/billing/invoiceShareToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public invoice PDF — token-only, same access model as /i/{shareToken}. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ shareToken: string }> },
) {
  const { shareToken } = await context.params;
  const invoiceId = await resolveInvoiceIdByShareToken(shareToken);
  if (!invoiceId) {
    return Response.json({ ok: false, message: 'Invoice not found.' }, { status: 404 });
  }

  try {
    const loaded = await loadInvoicePdfBytes(invoiceId);
    if (!loaded) {
      return Response.json({ ok: false, message: 'Invoice not found.' }, { status: 404 });
    }
    return invoicePdfResponse(loaded.bytes, loaded.filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF generation failed.';
    console.error('[invoices/share/pdf] generation failed', { shareToken, message });
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
