import ExcelJS from 'exceljs';
import { rowsToCsv, paiseToCsvRupees } from '@/src/hair/lib/export/csv';
import { setExcelHyperlinkCell } from '@/src/hair/lib/export/excelHyperlink';
import { appendInvoiceRegisterExcelSummary, computeRegisterSummaryTotals } from '@/src/hair/lib/export/invoiceRegisterExcelSummary';
import { invoicePublicViewUrl } from '@/src/hair/lib/invoicePublicLinks';
import type { InvoiceRegisterRow } from '@/src/hair/services/invoiceRegisterQueries';

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function exportInvoiceRegisterExcel(rows: InvoiceRegisterRow[]): Promise<Buffer> {
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

export function exportInvoiceRegisterPdfHtml(rows: InvoiceRegisterRow[], title: string): string {
  const money = (p: number) => paiseToCsvRupees(p);
  const bodyRows = rows
    .map(
      (r) =>
        `<tr>
          <td>${escapeHtml(r.invoiceNumber)}</td>
          <td>${formatDate(r.invoiceDate)}</td>
          <td>${escapeHtml(r.customerName)}</td>
          <td>${escapeHtml(r.mobile)}</td>
          <td>${escapeHtml(r.servicesSummary.slice(0, 80))}${r.servicesSummary.length > 80 ? '…' : ''}</td>
          <td>${escapeHtml(r.paymentModes)}</td>
          <td class="num">${money(r.taxablePaise)}</td>
          <td class="num">${money(r.gstPaise)}</td>
          <td class="num">${money(r.grandTotalPaise)}</td>
          <td class="num">${money(r.paidPaise)}</td>
          <td>${escapeHtml(r.status)}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body{font-family:Georgia,serif;color:#14261c;padding:24px}
  h1{font-size:20px;margin:0 0 8px}
  .muted{color:#5c6b62;font-size:12px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #d7e0d9;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#eef3ef;font-weight:600}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  @media print{body{padding:0}}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p class="muted">${rows.length} invoice(s) · Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</p>
<table>
<thead><tr>
  <th>Invoice</th><th>Date</th><th>Customer</th><th>Mobile</th><th>Services</th>
  <th>Payment</th><th>Taxable</th><th>GST</th><th>Total</th><th>Paid</th><th>Status</th>
</tr></thead>
<tbody>${bodyRows}</tbody>
</table>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
}
