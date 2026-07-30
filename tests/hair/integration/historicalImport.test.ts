import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { hairDb } from '../../../src/hair/db/client';
import {
  fyhCommissionEntries,
  fyhInvoiceLineAttributions,
  fyhInvoiceLines,
  fyhInvoices,
} from '../../../src/hair/db/schema';
import { importHistoricalSales } from '../../../src/hair/services/historicalImport';
import { gstDetailReport } from '../../../src/hair/services/reportQueries';
import { probeHairQuickSaleMigrations, migrationSkipMessage } from './migrationGuard.ts';

async function buildSampleWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  const headers = [
    'row_id',
    'transaction_date',
    'customer_name',
    'customer_phone',
    'description',
    'amount_inr',
    'payment_method',
    'gst_percent',
    'discount_inr',
    'original_invoice_ref',
    'quantity',
  ];
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(headers.map((h) => row[h] ?? ''));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('historical import creates paid invoices without staff side effects', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) {
    t.skip(migrationSkipMessage(probe));
    return;
  }

  const rowKey = `test-hist-${Date.now()}`;
  const buffer = await buildSampleWorkbook([
    {
      row_id: rowKey,
      transaction_date: '2023-06-10',
      customer_name: 'Historical Import Test',
      customer_phone: '9123456789',
      description: 'Legacy facial package',
      amount_inr: 2360,
      payment_method: 'cash',
      gst_percent: 18,
      discount_inr: 0,
      original_invoice_ref: 'OLD-123',
      quantity: 1,
    },
  ]);

  const first = await importHistoricalSales({
    fileName: 'test-historical.xlsx',
    buffer,
  });
  assert.equal(first.summary.imported, 1);
  assert.ok(first.batchId);

  const [inv] = await hairDb
    .select()
    .from(fyhInvoices)
    .where(eq(fyhInvoices.importRowKey, rowKey))
    .limit(1);
  assert.ok(inv);
  assert.equal(inv.source, 'historical_import');
  assert.equal(inv.status, 'paid');
  assert.equal(inv.stylistId, null);
  assert.equal(inv.paidAt?.toISOString().slice(0, 10), '2023-06-10');
  assert.match(inv.notes ?? '', /Imported Historical Entry/);

  const lines = await hairDb
    .select()
    .from(fyhInvoiceLines)
    .where(eq(fyhInvoiceLines.invoiceId, inv.id));
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.staffId, null);

  const attrs = await hairDb
    .select()
    .from(fyhInvoiceLineAttributions)
    .where(eq(fyhInvoiceLineAttributions.invoiceLineId, lines[0]!.id));
  assert.equal(attrs.length, 0);

  const commissions = await hairDb
    .select()
    .from(fyhCommissionEntries)
    .where(eq(fyhCommissionEntries.invoiceLineId, lines[0]!.id));
  assert.equal(commissions.length, 0);

  const second = await importHistoricalSales({
    fileName: 'test-historical.xlsx',
    buffer,
  });
  assert.equal(second.skippedExistingBatch, true);
  assert.equal(second.summary.imported, first.summary.imported);

  const from = new Date('2023-06-01T00:00:00.000Z');
  const to = new Date('2023-06-30T23:59:59.999Z');
  const gstRows = await gstDetailReport({ from, to });
  assert.ok(gstRows.some((r) => r.invoiceNumber === inv.invoiceNumber));
});
