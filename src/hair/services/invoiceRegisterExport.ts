import ExcelJS from 'exceljs';
import { rowsToCsv, paiseToCsvRupees } from '@/src/hair/lib/export/csv';
import type { InvoiceRegisterRow } from '@/src/hair/services/invoiceRegisterQueries';

function fyhBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    process.env.FYH_APP_URL?.replace(/\/$/, '') ||
    ''
  );
}

function invoiceViewUrl(invoiceId: string): string {
  const base = fyhBaseUrl();
  const path = `/fyh/billing/${invoiceId}`;
  return base ? `${base}${path}` : path;
}

function invoicePrintUrl(invoiceId: string): string {
  const base = fyhBaseUrl();
  const path = `/fyh/api/invoices/${invoiceId}/print`;
  return base ? `${base}${path}` : path;
}

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
    'View Invoice',
    'Download PDF',
  ];

  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const rowNum = i + 2;
    const viewUrl = invoiceViewUrl(r.id);
    const pdfUrl = invoicePrintUrl(r.id);

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
      viewUrl,
      pdfUrl,
    ]);

    const viewCell = sheet.getCell(`L${rowNum}`);
    viewCell.value = { text: 'View Invoice', hyperlink: viewUrl };
    viewCell.font = { color: { argb: 'FF0563C1' }, underline: true };

    const pdfCell = sheet.getCell(`M${rowNum}`);
    pdfCell.value = { text: 'Download PDF', hyperlink: pdfUrl };
    pdfCell.font = { color: { argb: 'FF0563C1' }, underline: true };
  }

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
    { width: 18 },
    { width: 18 },
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
    'Download PDF URL',
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
    invoiceViewUrl(r.id),
    invoicePrintUrl(r.id),
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
