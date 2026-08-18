import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhHistoricalImportBatches,
  fyhHistoricalImportRowErrors,
  fyhInvoicePayments,
  fyhInvoices,
  fyhInvoiceLines,
  type HistoricalImportSummary,
  type HistoricalImportValidation,
} from '@/src/hair/db/schema';
import {
  buildHistoricalInvoiceNotes,
  buildHistoricalLedgerPlan,
  computeImportRowKey,
  priceHistoricalInvoice,
  validateHistoricalRow,
  type HistoricalSalesRow,
} from '@/src/hair/domain/import/historicalInvoice';
import { parseHistoricalSalesWorkbook } from '@/src/hair/domain/import/finalBillsParser';
import { postLedgerEntries } from '@/src/hair/domain/ledger/service';
import { buildInvoicePrintHtml, getInvoiceDetail, nextInvoiceNumberForTx } from '@/src/hair/services/invoices';
import { getSalonSettings } from '@/src/hair/services/settings';
import { resolveHistoricalCustomer } from '@/src/hair/services/historicalImportCustomers';
import {
  applyServiceMapToRows,
  buildHistoricalServiceMap,
} from '@/src/hair/services/historicalImportServiceMap';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export type ImportHistoricalOptions = {
  fileName: string;
  buffer: Buffer;
  uploadedByAdminId?: string | null;
  dryRun?: boolean;
  force?: boolean;
  pdfOutputDir?: string;
};

export type ImportHistoricalResult = {
  batchId: string | null;
  summary: HistoricalImportSummary;
  skippedExistingBatch?: boolean;
  validationFailed?: boolean;
};

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function buildValidation(
  parsed: Awaited<ReturnType<typeof parseHistoricalSalesWorkbook>>,
  pricedRows: ReturnType<typeof priceHistoricalInvoice>[],
  rows: HistoricalSalesRow[],
): HistoricalImportValidation {
  const errors: string[] = [];
  const parsedRevenue = pricedRows.reduce((s, p) => s + p.grandTotalPaise, 0);
  const parsedCash = rows
    .filter((r) => r.paymentMethod === 'cash')
    .reduce((s, r) => s + r.amountPaise, 0);
  const parsedUpi = rows
    .filter((r) => r.paymentMethod === 'upi')
    .reduce((s, r) => s + r.amountPaise, 0);

  if (parsed.rows.length !== parsed.excelStats.rowCount) {
    errors.push(
      `Row count mismatch: Excel ${parsed.excelStats.rowCount} vs parsed ${parsed.rows.length}`,
    );
  }
  if (parsedRevenue !== parsed.excelStats.revenuePaise) {
    errors.push(
      `Revenue mismatch: Excel ₹${(parsed.excelStats.revenuePaise / 100).toFixed(2)} vs parsed ₹${(parsedRevenue / 100).toFixed(2)}`,
    );
  }
  if (parsedCash !== parsed.excelStats.cashPaise) {
    errors.push(
      `Cash mismatch: Excel ₹${(parsed.excelStats.cashPaise / 100).toFixed(2)} vs parsed ₹${(parsedCash / 100).toFixed(2)}`,
    );
  }
  if (parsedUpi !== parsed.excelStats.upiPaise) {
    errors.push(
      `UPI mismatch: Excel ₹${(parsed.excelStats.upiPaise / 100).toFixed(2)} vs parsed ₹${(parsedUpi / 100).toFixed(2)}`,
    );
  }

  return {
    passed: errors.length === 0 && parsed.parseErrors.length === 0,
    excelRowCount: parsed.excelStats.rowCount,
    excelRevenuePaise: parsed.excelStats.revenuePaise,
    excelCashPaise: parsed.excelStats.cashPaise,
    excelUpiPaise: parsed.excelStats.upiPaise,
    parsedRowCount: parsed.rows.length,
    errors,
  };
}

async function findExistingBatch(fileSha256: string) {
  const [batch] = await hairDb
    .select()
    .from(fyhHistoricalImportBatches)
    .where(
      and(
        eq(fyhHistoricalImportBatches.fileSha256, fileSha256),
        eq(fyhHistoricalImportBatches.status, 'completed'),
      ),
    )
    .limit(1);
  return batch ?? null;
}

async function findExistingInvoiceByRowKey(rowKey: string, ctx?: TenantContext | null) {
  const [inv] = await hairDb
    .select({ id: fyhInvoices.id })
    .from(fyhInvoices)
    .where(and(orgFilter(fyhInvoices.organizationId, ctx), locationFilter(fyhInvoices.locationId, ctx), eq(fyhInvoices.importRowKey, rowKey)))
    .limit(1);
  return inv ?? null;
}

async function writeInvoicePdfHtml(invoiceId: string, outputDir: string) {
  const detail = await getInvoiceDetail(invoiceId);
  if (!detail) return null;
  await mkdir(outputDir, { recursive: true });
  const html = buildInvoicePrintHtml(detail);
  const filePath = path.join(outputDir, `${detail.invoice.invoiceNumber}.html`);
  await writeFile(filePath, html, 'utf8');
  return filePath;
}

async function persistHistoricalRow(
  db: typeof hairDb,
  batchId: string,
  row: HistoricalSalesRow,
  pdfOutputDir?: string,
  ctx?: TenantContext | null,
): Promise<{
  imported: boolean;
  skipped: boolean;
  revenuePaise: number;
  gstPaise: number;
  cashPaise: number;
  upiPaise: number;
  invoiceId?: string;
}> {
  const rowKey = computeImportRowKey(row);
  const validationError = validateHistoricalRow(row);
  if (validationError) throw new Error(validationError);

  const existing = await findExistingInvoiceByRowKey(rowKey, ctx);
  if (existing) {
    return {
      imported: false,
      skipped: true,
      revenuePaise: 0,
      gstPaise: 0,
      cashPaise: 0,
      upiPaise: 0,
      invoiceId: existing.id,
    };
  }

  const priced = priceHistoricalInvoice(row);
  if (Math.abs(priced.grandTotalPaise - row.amountPaise) > itemsTolerance(row.lineItems.length)) {
    throw new Error(
      `Amount mismatch after GST math: expected ₹${(row.amountPaise / 100).toFixed(2)}, got ₹${(priced.grandTotalPaise / 100).toFixed(2)}`,
    );
  }

  const customer = await resolveHistoricalCustomer(db, {
    fullName: row.customerName,
    phone: row.customerPhone,
    rowKey,
  });

  const occurredAt = row.transactionDate;
  const invoiceNumber = await nextInvoiceNumberForTx(db);
  const notes = buildHistoricalInvoiceNotes(row.originalInvoiceRef);

  const [inv] = await db
    .insert(fyhInvoices)
    .values({
      invoiceNumber,
      customerId: customer.id,
      source: 'historical_import',
      stylistId: null,
      status: 'paid',
      subtotalPaise: priced.subtotalPaise,
      discountPaise: priced.discountPaise,
      taxPaise: priced.taxPaise,
      grandTotalPaise: priced.grandTotalPaise,
      amountPaidPaise: priced.grandTotalPaise,
      notes,
      importBatchId: batchId,
      importRowKey: rowKey,
      paidAt: occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    })
    .returning();

  if (!inv) throw new Error('Failed to create historical invoice');

  for (let i = 0; i < priced.lines.length; i++) {
    const line = priced.lines[i]!;
    const item = row.lineItems[i];
    const unitSellingPricePaise = line.catalogGrossPaise;
    await db.insert(fyhInvoiceLines).values({
      invoiceId: inv.id,
      kind: item?.kind ?? line.kind,
      serviceId: item?.serviceId ?? line.serviceId ?? null,
      staffId: null,
      nameSnapshot: line.description,
      quantity: line.quantity,
      unitPricePaise: unitSellingPricePaise,
      discountPaise: line.discountPaise,
      discountBps: line.discountBps,
      gstBps: line.gstBps,
      taxPaise: line.gstPaise,
      lineTotalPaise: line.finalLinePaise,
      sortOrder: i,
      createdAt: occurredAt,
    });
  }

  await db.insert(fyhInvoicePayments).values({
    invoiceId: inv.id,
    method: row.paymentMethod,
    amountPaise: priced.grandTotalPaise,
    reference: row.originalInvoiceRef ?? null,
    notes: 'Historical import',
    paidAt: occurredAt,
    createdAt: occurredAt,
  });

  const ledgerPlan = buildHistoricalLedgerPlan({
    customerId: customer.id,
    grandTotalPaise: priced.grandTotalPaise,
    paymentMethod: row.paymentMethod,
  });

  await postLedgerEntries(db, {
    customerId: customer.id,
    invoiceId: inv.id,
    entries: ledgerPlan,
    occurredAt,
  });

  if (pdfOutputDir) {
    await writeInvoicePdfHtml(inv.id, pdfOutputDir);
  }

  return {
    imported: true,
    skipped: false,
    revenuePaise: priced.grandTotalPaise,
    gstPaise: priced.taxPaise,
    cashPaise: row.paymentMethod === 'cash' ? priced.grandTotalPaise : 0,
    upiPaise: row.paymentMethod === 'upi' ? priced.grandTotalPaise : 0,
    invoiceId: inv.id,
  };
}

function itemsTolerance(lineCount: number): number {
  return Math.max(1, lineCount);
}

export async function importHistoricalSales(
  opts: ImportHistoricalOptions, ctx?: TenantContext | null): Promise<ImportHistoricalResult> {
  const fileSha256 = sha256(opts.buffer);
  const settings = await getSalonSettings();
  const defaultGstBps = settings.defaultGstBps ?? 1800;

  const parsed = await parseHistoricalSalesWorkbook(opts.buffer, defaultGstBps);
  const serviceMap = await buildHistoricalServiceMap();
  const rows = applyServiceMapToRows(parsed.rows, serviceMap);
  const pricedRows = rows.map((row) => priceHistoricalInvoice(row));
  const validation = buildValidation(parsed, pricedRows, rows);

  const summary: HistoricalImportSummary = {
    totalRows: rows.length,
    imported: 0,
    skipped: 0,
    failed: parsed.parseErrors.length,
    totalRevenuePaise: 0,
    totalGstPaise: 0,
    cashTotalPaise: 0,
    upiTotalPaise: 0,
    failedRows: parsed.parseErrors.map((e) => ({
      rowNumber: e.rowNumber,
      reason: e.sheetName ? `${e.sheetName}: ${e.reason}` : e.reason,
    })),
    validation,
  };

  if (!validation.passed) {
    summary.failed += rows.length;
    for (const err of validation.errors) {
      summary.failedRows.push({ rowNumber: 0, reason: err });
    }
    return { batchId: null, summary, validationFailed: true };
  }

  if (!opts.force && !opts.dryRun) {
    const existingBatch = await findExistingBatch(fileSha256);
    if (existingBatch?.summary) {
      return {
        batchId: existingBatch.id,
        summary: existingBatch.summary,
        skippedExistingBatch: true,
      };
    }
  }

  for (const row of rows) {
    const err = validateHistoricalRow(row);
    if (err) {
      summary.failed += 1;
      summary.failedRows.push({
        rowNumber: row.rowNumber,
        rowKey: computeImportRowKey(row),
        reason: err,
      });
    }
  }

  if (summary.failed > 0) {
    return { batchId: null, summary, validationFailed: true };
  }

  if (opts.dryRun) {
    for (const row of rows) {
      const priced = priceHistoricalInvoice(row);
      summary.imported += 1;
      summary.totalRevenuePaise += priced.grandTotalPaise;
      summary.totalGstPaise += priced.taxPaise;
      if (row.paymentMethod === 'cash') summary.cashTotalPaise! += priced.grandTotalPaise;
      if (row.paymentMethod === 'upi') summary.upiTotalPaise! += priced.grandTotalPaise;
    }
    return { batchId: null, summary };
  }

  const batchId = await hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;
    const [batch] = await db
      .insert(fyhHistoricalImportBatches)
      .values({
        fileName: opts.fileName,
        fileSha256,
        uploadedByAdminId: opts.uploadedByAdminId ?? null,
        status: 'running',
      })
      .returning();
    if (!batch) throw new Error('Failed to create import batch');

    for (const row of rows) {
      try {
        const result = await persistHistoricalRow(db, batch.id, row, opts.pdfOutputDir, ctx);
        if (result.skipped) {
          summary.skipped += 1;
        } else if (result.imported) {
          summary.imported += 1;
          summary.totalRevenuePaise += result.revenuePaise;
          summary.totalGstPaise += result.gstPaise;
          summary.cashTotalPaise! += result.cashPaise;
          summary.upiTotalPaise! += result.upiPaise;
        }
      } catch (e) {
        summary.failed += 1;
        const reason = e instanceof Error ? e.message : 'Import failed';
        const rowKey = computeImportRowKey(row);
        summary.failedRows.push({ rowNumber: row.rowNumber, rowKey, reason });
        await db.insert(fyhHistoricalImportRowErrors).values({
          batchId: batch.id,
          rowNumber: row.rowNumber,
          rowKey,
          errorMessage: reason,
          rawRow: row as unknown as Record<string, unknown>,
        });
        throw e;
      }
    }

    const status = summary.failed > 0 ? 'failed' : 'completed';
    await db
      .update(fyhHistoricalImportBatches)
      .set({
        status,
        summary,
        completedAt: new Date(),
      })
      .where(and(orgFilter(fyhHistoricalImportBatches.organizationId, ctx), eq(fyhHistoricalImportBatches.id, batch.id)));

    return batch.id;
  });

  return { batchId, summary };
}

export async function previewHistoricalSales(buffer: Buffer, ctx?: TenantContext | null) {
  const settings = await getSalonSettings();
  const defaultGstBps = settings.defaultGstBps ?? 1800;
  return parseHistoricalSalesWorkbook(buffer, defaultGstBps);
}

export async function getHistoricalImportBatch(batchId: string, ctx?: TenantContext | null) {
  const [batch] = await hairDb
    .select()
    .from(fyhHistoricalImportBatches)
    .where(and(orgFilter(fyhHistoricalImportBatches.organizationId, ctx), eq(fyhHistoricalImportBatches.id, batchId)))
    .limit(1);
  return batch ?? null;
}

