'use server';

import { requirePermission } from '@/src/hair/lib/auth/permissions';
import { buildNotificationPreview } from '@/src/hair/services/notifications';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { renderPublicInvoiceSheetHtml } from '@/src/hair/lib/publicInvoiceDocument';
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
import { getSalonSettings } from '@/src/hair/services/settings';
import { getTenantContextForAction } from '@/src/hair/lib/tenant/getTenantContext';

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
    const ctx = await getTenantContextForAction();
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

    const settings = await getSalonSettings(ctx);
    return {
      ok: true,
      format: 'pdf',
      filename: `fyh-invoice-register-${stamp}.html`,
      content: await exportInvoiceRegisterPdfHtml({
        rows,
        settings,
        period: { from: filters.from ?? null, to: filters.to ?? null },
      }),
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
    const ctx = await getTenantContextForAction();
    const detail = await getInvoiceDetail(invoiceId, ctx);
    if (!detail) return { ok: false, error: 'Invoice not found' };
    return { ok: true, html: buildInvoicePrintHtml(detail) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to load invoice' };
  }
}

export async function getInvoicePreviewAction(invoiceId: string): Promise<
  | {
      ok: true;
      sheetHtml: string;
      invoiceNumber: string;
      publicAccessToken: string;
      customerName: string;
      customerPhone: string;
      grandTotalLabel: string;
    }
  | { ok: false; error: string }
> {
  try {
    await requirePermission('page:billing');
    const ctx = await getTenantContextForAction();
    const detail = await getInvoiceDetail(invoiceId, ctx);
    if (!detail) return { ok: false, error: 'Invoice not found' };
    return {
      ok: true,
      sheetHtml: renderPublicInvoiceSheetHtml(detail),
      invoiceNumber: detail.invoice.invoiceNumber,
      publicAccessToken: detail.invoice.publicAccessToken,
      customerName: detail.customerName,
      customerPhone: detail.customerPhone,
      grandTotalLabel: formatInrFromPaise(detail.invoice.grandTotalPaise),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to load invoice' };
  }
}

export async function getInvoiceSharePreviewAction(input: {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  grandTotalPaise: number;
}): Promise<{ ok: true; body: string; waUrl: string } | { ok: false; error: string }> {
  try {
    await requirePermission('page:billing');
    const preview = await buildNotificationPreview({
      kind: 'whatsapp_invoice',
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      grandTotalPaise: input.grandTotalPaise,
      invoiceNumber: input.invoiceNumber,
    });
    if (!preview) return { ok: false, error: 'Could not build share message' };
    return { ok: true, body: preview.body, waUrl: preview.waUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Share failed' };
  }
}
