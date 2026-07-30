import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhCustomers, fyhInvoices, fyhInvoiceLines, fyhInvoicePayments } from '@/src/hair/db/schema';

function inr(paise: number): number {
  return paise / 100;
}

export async function exportHistoricalImportBatchXlsx(batchId: string): Promise<Buffer> {
  const rows = await hairDb
    .select({
      invoiceNumber: fyhInvoices.invoiceNumber,
      transactionDate: fyhInvoices.paidAt,
      customerName: fyhCustomers.fullName,
      customerPhone: fyhCustomers.phone,
      description: fyhInvoiceLines.nameSnapshot,
      quantity: fyhInvoiceLines.quantity,
      subtotalPaise: fyhInvoices.subtotalPaise,
      taxPaise: fyhInvoices.taxPaise,
      discountPaise: fyhInvoices.discountPaise,
      grandTotalPaise: fyhInvoices.grandTotalPaise,
      paymentMethod: fyhInvoicePayments.method,
      importRowKey: fyhInvoices.importRowKey,
      notes: fyhInvoices.notes,
      batchId: fyhInvoices.importBatchId,
    })
    .from(fyhInvoices)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.invoiceId, fyhInvoices.id))
    .innerJoin(fyhInvoicePayments, eq(fyhInvoicePayments.invoiceId, fyhInvoices.id))
    .where(eq(fyhInvoices.importBatchId, batchId))
    .orderBy(fyhInvoices.paidAt);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Imported Invoices');
  sheet.columns = [
    { header: 'Invoice Number', key: 'invoiceNumber', width: 16 },
    { header: 'Transaction Date', key: 'transactionDate', width: 14 },
    { header: 'Customer Name', key: 'customerName', width: 24 },
    { header: 'Customer Phone', key: 'customerPhone', width: 14 },
    { header: 'Description', key: 'description', width: 32 },
    { header: 'Quantity', key: 'quantity', width: 10 },
    { header: 'Subtotal (INR)', key: 'subtotalInr', width: 14 },
    { header: 'GST (INR)', key: 'gstInr', width: 12 },
    { header: 'Discount (INR)', key: 'discountInr', width: 14 },
    { header: 'Grand Total (INR)', key: 'grandTotalInr', width: 16 },
    { header: 'Payment Method', key: 'paymentMethod', width: 14 },
    { header: 'Import Row Key', key: 'importRowKey', width: 24 },
    { header: 'Notes', key: 'notes', width: 36 },
    { header: 'Batch ID', key: 'batchId', width: 38 },
  ];

  for (const r of rows) {
    sheet.addRow({
      invoiceNumber: r.invoiceNumber,
      transactionDate: r.transactionDate?.toISOString().slice(0, 10) ?? '',
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      description: r.description,
      quantity: r.quantity,
      subtotalInr: inr(r.subtotalPaise),
      gstInr: inr(r.taxPaise),
      discountInr: inr(r.discountPaise),
      grandTotalInr: inr(r.grandTotalPaise),
      paymentMethod: r.paymentMethod,
      importRowKey: r.importRowKey,
      notes: r.notes,
      batchId: r.batchId,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
