import ExcelJS from 'exceljs';
import { and, eq, inArray } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomers,
  fyhInvoices,
  fyhInvoiceLines,
  fyhInvoicePayments,
} from '@/src/hair/db/schema';
import { setExcelHyperlinkCell } from '@/src/hair/lib/export/excelHyperlink';
import { invoicePublicViewUrl } from '@/src/hair/lib/invoicePublicLinks';

function inr(paise: number): number {
  return paise / 100;
}

export type InvoiceRegisterRow = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  mobileNumber: string;
  service: string;
  paymentMode: string;
  amountInr: number;
  gstInr: number;
  grandTotalInr: number;
  invoiceStatus: string;
  sheetName?: string;
};

const VIEW_INVOICE_COL = 12;

async function fetchRegisterRows(batchId: string): Promise<InvoiceRegisterRow[]> {
  const invoices = await hairDb
    .select({
      id: fyhInvoices.id,
      invoiceNumber: fyhInvoices.invoiceNumber,
      invoiceDate: fyhInvoices.paidAt,
      customerName: fyhCustomers.fullName,
      mobileNumber: fyhCustomers.phone,
      subtotalPaise: fyhInvoices.subtotalPaise,
      taxPaise: fyhInvoices.taxPaise,
      grandTotalPaise: fyhInvoices.grandTotalPaise,
      paymentMode: fyhInvoicePayments.method,
      invoiceStatus: fyhInvoices.status,
    })
    .from(fyhInvoices)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .innerJoin(fyhInvoicePayments, eq(fyhInvoicePayments.invoiceId, fyhInvoices.id))
    .where(eq(fyhInvoices.importBatchId, batchId))
    .orderBy(fyhInvoices.paidAt);

  if (!invoices.length) return [];

  const invoiceIds = invoices.map((i) => i.id);
  const lineRows = await hairDb
    .select({
      invoiceId: fyhInvoiceLines.invoiceId,
      nameSnapshot: fyhInvoiceLines.nameSnapshot,
    })
    .from(fyhInvoiceLines)
    .where(inArray(fyhInvoiceLines.invoiceId, invoiceIds))
    .orderBy(fyhInvoiceLines.sortOrder);

  const serviceByInvoice = new Map<string, string[]>();
  for (const line of lineRows) {
    const list = serviceByInvoice.get(line.invoiceId) ?? [];
    list.push(line.nameSnapshot);
    serviceByInvoice.set(line.invoiceId, list);
  }

  return invoices.map((inv) => ({
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate?.toISOString().slice(0, 10) ?? '',
    customerName: inv.customerName,
    mobileNumber: inv.mobileNumber,
    service: (serviceByInvoice.get(inv.id) ?? []).join(', '),
    paymentMode: inv.paymentMode,
    amountInr: inr(inv.subtotalPaise),
    gstInr: inr(inv.taxPaise),
    grandTotalInr: inr(inv.grandTotalPaise),
    invoiceStatus: inv.invoiceStatus,
  }));
}

function addSummaryRows(sheet: ExcelJS.Worksheet, rows: InvoiceRegisterRow[]) {
  const totalRevenue = rows.reduce((s, r) => s + r.grandTotalInr, 0);
  const totalGst = rows.reduce((s, r) => s + r.gstInr, 0);
  const cashTotal = rows
    .filter((r) => r.paymentMode === 'cash')
    .reduce((s, r) => s + r.grandTotalInr, 0);
  const upiTotal = rows
    .filter((r) => r.paymentMode === 'upi')
    .reduce((s, r) => s + r.grandTotalInr, 0);

  sheet.addRow([]);
  sheet.addRow(['Summary']);
  sheet.addRow(['Total invoices', rows.length]);
  sheet.addRow(['Total revenue (INR)', totalRevenue]);
  sheet.addRow(['GST collected (INR)', totalGst]);
  sheet.addRow(['Cash total (INR)', cashTotal]);
  sheet.addRow(['UPI total (INR)', upiTotal]);
}

function addRegisterSheet(workbook: ExcelJS.Workbook, sheetName: string, rows: InvoiceRegisterRow[]) {
  const sheet = workbook.addWorksheet(sheetName);

  sheet.addRow([
    'Invoice Number',
    'Invoice Date',
    'Customer Name',
    'Mobile Number',
    'Service',
    'Payment Mode',
    'Amount',
    'GST',
    'Grand Total',
    'Invoice Status',
    'View Invoice',
  ]);
  sheet.getRow(1).font = { bold: true };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const rowNum = i + 2;
    sheet.addRow([
      r.invoiceNumber,
      r.invoiceDate,
      r.customerName,
      r.mobileNumber,
      r.service,
      r.paymentMode,
      r.amountInr,
      r.gstInr,
      r.grandTotalInr,
      r.invoiceStatus,
      '',
    ]);
    setExcelHyperlinkCell(
      sheet.getCell(rowNum, VIEW_INVOICE_COL),
      'View Invoice',
      invoicePublicViewUrl(r.invoiceNumber),
    );
  }

  sheet.columns = [
    { width: 16 },
    { width: 14 },
    { width: 24 },
    { width: 14 },
    { width: 32 },
    { width: 14 },
    { width: 12 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];

  addSummaryRows(sheet, rows);
}

export async function exportHistoricalImportRegisters(
  batchId: string,
  rows: InvoiceRegisterRow[],
): Promise<Map<string, Buffer>> {
  if (!rows.length) {
    rows = await fetchRegisterRows(batchId);
  }

  const byMonth = new Map<string, InvoiceRegisterRow[]>();
  for (const row of rows) {
    const month = monthFromDate(row.invoiceDate);
    const list = byMonth.get(month) ?? [];
    list.push(row);
    byMonth.set(month, list);
  }

  const outputs = new Map<string, Buffer>();

  for (const [month, monthRows] of byMonth) {
    const wb = new ExcelJS.Workbook();
    addRegisterSheet(wb, 'Invoices', monthRows);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    outputs.set(`${month} Invoice Register.xlsx`, buf);
  }

  const combined = new ExcelJS.Workbook();
  addRegisterSheet(combined, 'All Invoices', rows);
  outputs.set('Combined Invoice Register.xlsx', Buffer.from(await combined.xlsx.writeBuffer()));

  return outputs;
}

function monthFromDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return months[d.getUTCMonth()] ?? 'Unknown';
}

export async function exportHistoricalImportBatchXlsx(batchId: string): Promise<Buffer> {
  const rows = await fetchRegisterRows(batchId);
  const wb = new ExcelJS.Workbook();
  addRegisterSheet(wb, 'Imported Invoices', rows);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export { fetchRegisterRows };
