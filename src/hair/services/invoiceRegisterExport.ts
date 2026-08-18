import ExcelJS from 'exceljs';
import { rowsToCsv, paiseToCsvRupees } from '@/src/hair/lib/export/csv';
import { setExcelHyperlinkCell } from '@/src/hair/lib/export/excelHyperlink';
import { appendInvoiceRegisterExcelSummary, computeRegisterSummaryTotals } from '@/src/hair/lib/export/invoiceRegisterExcelSummary';
import { buildInvoiceRegisterPdfHtml } from '@/src/hair/lib/export/invoiceRegisterPdf';
import { invoicePublicViewUrl } from '@/src/hair/lib/invoicePublicLinks';
import type { SalonSettings } from '@/src/hair/services/settings';
import type { InvoiceRegisterRow } from '@/src/hair/services/invoiceRegisterQueries';

export { buildInvoiceRegisterPdfHtml } from '@/src/hair/lib/export/invoiceRegisterPdf';

const COL = {
  invoiceNumber: 1,
  taxable: 7,
  gst: 8,
  grandTotal: 9,
  paid: 10,
  viewInvoice: 12,
} as const;

const FIRST_DATA_ROW = 2;

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function exportInvoiceRegisterExcel(rows: InvoiceRegisterRow[], ctx?: TenantContext | null): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Invoice Register');

  sheet.addRow([
    'Invoice Number',
    'Invoice Date',
    'Customer',
    'Mobile',
    'Services',
    'Payment Mode',
    'Taxable Amount',
    'GST',
    'Grand Total',
    'Paid Amount',
    'Status',
    'View Invoice',
  ]);
  sheet.getRow(1).font = { bold: true };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const rowNum = i + 2;
    const viewUrl = invoicePublicViewUrl(r.invoiceNumber);

    sheet.addRow([
      r.invoiceNumber,
      formatDate(r.invoiceDate),
      r.customerName,
      r.mobile,
      r.servicesSummary,
      r.paymentModes,
      r.taxablePaise / 100,
      r.gstPaise / 100,
      r.grandTotalPaise / 100,
      r.paidPaise / 100,
      r.status,
      '',
    ]);

    setExcelHyperlinkCell(sheet.getCell(rowNum, COL.viewInvoice), 'View Invoice', viewUrl);
  }

  const lastDataRow = rows.length > 0 ? rows.length + 1 : FIRST_DATA_ROW - 1;
  appendInvoiceRegisterExcelSummary(sheet, FIRST_DATA_ROW, lastDataRow, {
    invoiceNumberCol: COL.invoiceNumber,
    taxableCol: COL.taxable,
    gstCol: COL.gst,
    grandTotalCol: COL.grandTotal,
    paidCol: COL.paid,
  }, computeRegisterSummaryTotals(rows.map((r) => ({
    taxable: r.taxablePaise / 100,
    gst: r.gstPaise / 100,
    grandTotal: r.grandTotalPaise / 100,
    paid: r.paidPaise / 100,
  }))));

  sheet.columns = [
    { width: 16 },
    { width: 14 },
    { width: 24 },
    { width: 14 },
    { width: 36 },
    { width: 16 },
    { width: 14 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
  ];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function exportInvoiceRegisterCsv(rows: InvoiceRegisterRow[]): string {
  const headers = [
    'Invoice Number',
    'Invoice Date',
    'Customer',
    'Mobile',
    'Services',
    'Payment Mode',
    'Taxable Amount',
    'GST',
    'Grand Total',
    'Paid Amount',
    'Status',
    'View Invoice URL',
  ];

  const data = rows.map((r) => [
    r.invoiceNumber,
    formatDate(r.invoiceDate),
    r.customerName,
    r.mobile,
    r.servicesSummary,
    r.paymentModes,
    paiseToCsvRupees(r.taxablePaise),
    paiseToCsvRupees(r.gstPaise),
    paiseToCsvRupees(r.grandTotalPaise),
    paiseToCsvRupees(r.paidPaise),
    r.status,
    invoicePublicViewUrl(r.invoiceNumber),
  ]);

  return rowsToCsv(headers, data);
}

/** Professional print/PDF HTML for Invoice Register (Asia/Kolkata stamps). */
export async function exportInvoiceRegisterPdfHtml(input: {
  rows: InvoiceRegisterRow[];
  settings: SalonSettings | null;
  period: { from: Date | null; to: Date | null };
  generatedAt?: Date;
}, ctx?: TenantContext | null): Promise<string> {
  return buildInvoiceRegisterPdfHtml(input);
}
