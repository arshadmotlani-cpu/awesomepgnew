import ExcelJS from 'exceljs';
import { and, eq, inArray } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomers,
  fyhInvoices,
  fyhInvoiceLines,
  fyhInvoicePayments,
} from '@/src/hair/db/schema';
import { appendInvoiceRegisterExcelSummary, computeRegisterSummaryTotals } from '@/src/hair/lib/export/invoiceRegisterExcelSummary';
import { setExcelHyperlinkCell } from '@/src/hair/lib/export/excelHyperlink';
import { invoicePublicViewUrl } from '@/src/hair/lib/invoicePublicLinks';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

const COL = {
  invoiceNumber: 1,
  taxable: 7,
  gst: 8,
  grandTotal: 9,
  paid: 10,
  viewInvoice: 12,
} as const;

const FIRST_DATA_ROW = 2;

function inr(paise: number): number {
  return paise / 100;
}

export type InvoiceRegisterRow = {
  invoiceId: string;
  invoiceNumber: string;
  publicAccessToken: string;
  invoiceDate: string;
  customerName: string;
  mobileNumber: string;
  service: string;
  paymentMode: string;
  amountInr: number;
  gstInr: number;
  grandTotalInr: number;
  paidInr: number;
  invoiceStatus: string;
  sheetName?: string;
};

const VIEW_INVOICE_COL = COL.viewInvoice;

async function fetchRegisterRows(batchId: string, ctx?: TenantContext | null): Promise<InvoiceRegisterRow[]> {
  const invoices = await hairDb
    .select({
      id: fyhInvoices.id,
      invoiceNumber: fyhInvoices.invoiceNumber,
      publicAccessToken: fyhInvoices.publicAccessToken,
      invoiceDate: fyhInvoices.paidAt,
      customerName: fyhCustomers.fullName,
      mobileNumber: fyhCustomers.phone,
      subtotalPaise: fyhInvoices.subtotalPaise,
      taxPaise: fyhInvoices.taxPaise,
      grandTotalPaise: fyhInvoices.grandTotalPaise,
      amountPaidPaise: fyhInvoices.amountPaidPaise,
      paymentMode: fyhInvoicePayments.method,
      invoiceStatus: fyhInvoices.status,
    })
    .from(fyhInvoices)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .innerJoin(fyhInvoicePayments, eq(fyhInvoicePayments.invoiceId, fyhInvoices.id))
    .where(and(orgFilter(fyhInvoices.organizationId, ctx), locationFilter(fyhInvoices.locationId, ctx), eq(fyhInvoices.importBatchId, batchId)))
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
    publicAccessToken: inv.publicAccessToken,
    invoiceDate: inv.invoiceDate?.toISOString().slice(0, 10) ?? '',
    customerName: inv.customerName,
    mobileNumber: inv.mobileNumber,
    service: (serviceByInvoice.get(inv.id) ?? []).join(', '),
    paymentMode: inv.paymentMode ?? '',
    amountInr: inr(inv.subtotalPaise),
    gstInr: inr(inv.taxPaise),
    grandTotalInr: inr(inv.grandTotalPaise),
    paidInr: inr(inv.amountPaidPaise),
    invoiceStatus: inv.invoiceStatus,
  }));
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
    'Taxable Amount',
    'GST',
    'Grand Total',
    'Paid Amount',
    'Invoice Status',
    'View Invoice',
  ]);
  sheet.getRow(1).font = { bold: true };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const rowNum = i + FIRST_DATA_ROW;
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
      r.paidInr,
      r.invoiceStatus,
      '',
    ]);
    setExcelHyperlinkCell(
      sheet.getCell(rowNum, VIEW_INVOICE_COL),
      'View Invoice',
      invoicePublicViewUrl(r.publicAccessToken),
    );
  }

  sheet.columns = [
    { width: 16 },
    { width: 14 },
    { width: 24 },
    { width: 14 },
    { width: 32 },
    { width: 14 },
    { width: 14 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];

  const lastDataRow = rows.length > 0 ? rows.length + 1 : FIRST_DATA_ROW - 1;
  appendInvoiceRegisterExcelSummary(sheet, FIRST_DATA_ROW, lastDataRow, {
    invoiceNumberCol: COL.invoiceNumber,
    taxableCol: COL.taxable,
    gstCol: COL.gst,
    grandTotalCol: COL.grandTotal,
    paidCol: COL.paid,
  }, computeRegisterSummaryTotals(rows.map((r) => ({
    taxable: r.amountInr,
    gst: r.gstInr,
    grandTotal: r.grandTotalInr,
    paid: r.paidInr,
  }))));
}

export async function exportHistoricalImportRegisters(
  batchId: string,
  rows: InvoiceRegisterRow[], ctx?: TenantContext | null): Promise<Map<string, Buffer>> {
  if (!rows.length) {
    rows = await fetchRegisterRows(batchId, ctx);
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

export async function exportHistoricalImportBatchXlsx(batchId: string, ctx?: TenantContext | null): Promise<Buffer> {
  const rows = await fetchRegisterRows(batchId, ctx);
  const wb = new ExcelJS.Workbook();
  addRegisterSheet(wb, 'Imported Invoices', rows);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export { fetchRegisterRows };
