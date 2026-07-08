import { getAdminSession, getCustomerSession } from '@/src/lib/auth/session';
import {
  invoicePdfResponse,
  loadInvoicePdfBytesByRef,
} from '@/src/lib/billing/invoicePdfDownload';
import { assertCustomerOwnsFinancialInvoiceDetailed } from '@/src/lib/billing/residentInvoiceAccess';
import { resolveFinancialInvoiceRef } from '@/src/lib/billing/resolveFinancialInvoiceRef';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ ref: string }> },
) {
  const { ref } = await context.params;
  const resolved = await resolveFinancialInvoiceRef(ref);
  if (!resolved) {
    return Response.json({ ok: false, message: 'Invoice not found.' }, { status: 404 });
  }

  const [adminSession, customerSession] = await Promise.all([
    getAdminSession(),
    getCustomerSession(),
  ]);

  if (adminSession) {
    // Any authenticated admin may download invoices (same as /admin/invoices/[id]).
  } else if (customerSession) {
    const ownership = await assertCustomerOwnsFinancialInvoiceDetailed(
      customerSession.customerId,
      resolved.id,
    );
    if (!ownership.owns) {
      return Response.json({ ok: false, message: 'Access denied.' }, { status: 403 });
    }
  } else {
    return Response.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }

  try {
    const loaded = await loadInvoicePdfBytesByRef(ref);
    if (!loaded) {
      return Response.json({ ok: false, message: 'Invoice not found.' }, { status: 404 });
    }
    return invoicePdfResponse(loaded.bytes, loaded.filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF generation failed.';
    console.error('[invoices/pdf] generation failed', { ref, message });
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
