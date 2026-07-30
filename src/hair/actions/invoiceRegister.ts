'use server';

import { requirePermission } from '@/src/hair/lib/auth/permissions';
import { buildNotificationPreview } from '@/src/hair/services/notifications';
import {
  buildInvoicePrintHtml,
  getInvoiceDetail,
} from '@/src/hair/services/invoices';
import {
  exportInvoiceRegisterCsv,
  exportInvoiceRegisterExcel,
  exportInvoiceRegisterPdfHtml,
} from '@/src/hair/services/invoiceRegisterExport';
import {
  parseRegisterFiltersFromSearchParams,
  queryInvoiceRegisterForExport,
  type InvoiceRegisterFilters,
} from '@/src/hair/services/invoiceRegisterQueries';

export type InvoiceRegisterExportFormat = 'xlsx' | 'csv' | 'pdf';

export type ExportInvoiceRegisterResult =
  | { ok: true; format: 'xlsx'; filename: string; base64: string }
  | { ok: true; format: 'csv'; filename: string; content: string }
  | { ok: true; format: 'pdf'; filename: string; content: string }
  | { ok: false; error: string };

function filtersFromRecord(
  raw: Record<string, string | string[] | undefined>,
): InvoiceRegisterFilters {
  return parseRegisterFiltersFromSearchParams(raw);
}

export async function exportInvoiceRegisterAction(input: {
  filters: Record<string, string | string[] | undefined>;
  format: InvoiceRegisterExportFormat;
}): Promise<ExportInvoiceRegisterResult> {
  try {
    await requirePermission('page:billing');
    const filters = filtersFromRecord(input.filters);
    const rows = await queryInvoiceRegisterForExport(filters);
    const stamp = new Date().toISOString().slice(0, 10);

    if (input.format === 'xlsx') {
      const buf = await exportInvoiceRegisterExcel(rows);
      return {
        ok: true,
        format: 'xlsx',
        filename: `fyh-invoice-register-${stamp}.xlsx`,
        base64: buf.toString('base64'),
      };
    }

    if (input.format === 'csv') {
      return {
        ok: true,
        format: 'csv',
        filename: `fyh-invoice-register-${stamp}.csv`,
        content: exportInvoiceRegisterCsv(rows),
      };
    }

    return {
      ok: true,
      format: 'pdf',
      filename: `fyh-invoice-register-${stamp}.html`,
      content: exportInvoiceRegisterPdfHtml(rows, 'FYH Invoice Register'),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export failed' };
  }
}

export async function getInvoicePrintHtmlAction(invoiceId: string): Promise<
  { ok: true; html: string } | { ok: false; error: string }
> {
  try {
    await requirePermission('page:billing');
    const detail = await getInvoiceDetail(invoiceId);
    if (!detail) return { ok: false, error: 'Invoice not found' };
    return { ok: true, html: buildInvoicePrintHtml(detail) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to load invoice' };
  }
}

export async function getInvoiceSharePreviewAction(input: {
  invoiceId: string;
  customerName: string;
  customerPhone: string;
  grandTotalPaise: number;
}): Promise<{ ok: true; body: string; waUrl: string } | { ok: false; error: string }> {
  try {
    await requirePermission('page:billing');
    const baseUrl =
      typeof process.env.NEXT_PUBLIC_APP_URL === 'string'
        ? process.env.NEXT_PUBLIC_APP_URL
        : undefined;
    const preview = await buildNotificationPreview({
      kind: 'whatsapp_invoice',
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      grandTotalPaise: input.grandTotalPaise,
      invoiceId: input.invoiceId,
      baseUrl,
    });
    if (!preview) return { ok: false, error: 'Could not build share message' };
    return { ok: true, body: preview.body, waUrl: preview.waUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Share failed' };
  }
}
