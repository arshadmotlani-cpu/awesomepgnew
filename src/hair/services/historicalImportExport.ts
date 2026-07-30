import ExcelJS from 'exceljs';
import { and, eq, inArray } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomers,
  fyhInvoices,
  fyhInvoiceLines,
  fyhInvoicePayments,
} from '@/src/hair/db/schema';

function inr(paise: number): number {
  return paise / 100;
}

export type InvoiceRegisterRow = {
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
  invoiceUrl: string;
  pdfUrl: string;
  sheetName?: string;
};

function fyhBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    process.env.FYH_APP_URL?.replace(/\/$/, '') ||
    ''
  );
}

function invoiceUrls(invoiceId: string, invoiceNumber: string, pdfRelativePath?: string) {
  const base = fyhBaseUrl();
  const invoicePath = `/fyh/billing/${invoiceId}`;
  const pdfPath = pdfRelativePath ?? invoicePath;
  return {
    invoiceUrl: base ? `${base}${invoicePath}` : invoicePath,
    pdfUrl: base && pdfRelativePath ? `${base}${pdfRelativePath}` : pdfPath,
  };
}

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

  return invoices.map((inv) => {
    const urls = invoiceUrls(
      inv.id,
      inv.invoiceNumber,
      `/fyh/billing/${inv.id}`,
    );
    return {
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
      invoiceUrl: urls.invoiceUrl,
      pdfUrl: urls.pdfUrl,
    };
  });
}

function addSummaryRows(
  sheet: ExcelJS.Worksheet,
  rows: InvoiceRegisterRow[],
) {
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
  sheet.columns = [
    { header: 'Invoice Number', key: 'invoiceNumber', width: 16 },
    { header: 'Invoice Date', key: 'invoiceDate', width: 14 },
    { header: 'Customer Name', key: 'customerName', width: 24 },
    { header: 'Mobile Number', key: 'mobileNumber', width: 14 },
    { header: 'Service', key: 'service', width: 32 },
    { header: 'Payment Mode', key: 'paymentMode', width: 14 },
    { header: 'Amount', key: 'amountInr', width: 12 },
    { header: 'GST', key: 'gstInr', width: 10 },
    { header: 'Grand Total', key: 'grandTotalInr', width: 14 },
    { header: 'Invoice Status', key: 'invoiceStatus', width: 14 },
    { header: 'Invoice URL', key: 'invoiceUrl', width: 40 },
    { header: 'PDF URL', key: 'pdfUrl', width: 40 },
  ];

  for (const r of rows) {
    sheet.addRow(r);
  }
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

