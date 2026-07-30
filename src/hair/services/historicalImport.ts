import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhHistoricalImportBatches,
  fyhHistoricalImportRowErrors,
  fyhInvoicePayments,
  fyhInvoices,
  fyhInvoiceLines,
  type HistoricalImportSummary,
} from '@/src/hair/db/schema';
import {
  buildHistoricalInvoiceNotes,
  buildHistoricalLedgerPlan,
  computeImportRowKey,
  mapHeaderToField,
  parseExcelDate,
  parseInrToPaise,
  parsePaymentMethod,
  priceHistoricalLine,
  validateHistoricalRow,
  type HistoricalSalesRow,
} from '@/src/hair/domain/import/historicalInvoice';
import { postLedgerEntries } from '@/src/hair/domain/ledger/service';
import { nextInvoiceNumberForTx } from '@/src/hair/services/invoices';
import { getSalonSettings } from '@/src/hair/services/settings';
import { resolveHistoricalCustomer } from '@/src/hair/services/historicalImportCustomers';

export type ParsedHistoricalImport = {
  rows: HistoricalSalesRow[];
  parseErrors: Array<{ rowNumber: number; reason: string }>;
};

export type ImportHistoricalOptions = {
  fileName: string;
  buffer: Buffer;
  uploadedByAdminId?: string | null;
  dryRun?: boolean;
  force?: boolean;
};

export type ImportHistoricalResult = {
  batchId: string | null;
  summary: HistoricalImportSummary;
  skippedExistingBatch?: boolean;
};

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v && typeof v === 'object' && 'result' in v) {
    return (v as ExcelJS.CellFormulaValue).result;
  }
  if (v && typeof v === 'object' && 'richText' in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('');
  }
  return v;
}

export async function parseHistoricalSalesExcel(buffer: Buffer): Promise<ParsedHistoricalImport> {
  const settings = await getSalonSettings();
  const defaultGstBps = settings.defaultGstBps ?? 1800;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], parseErrors: [{ rowNumber: 0, reason: 'Workbook has no worksheets' }] };
  }

  const headerRow = sheet.getRow(1);
  const fieldByCol = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = String(cellValue(cell) ?? '').trim();
    const field = mapHeaderToField(header);
    if (field) fieldByCol.set(colNumber, field);
  });

  const required = ['transaction_date', 'customer_name', 'description', 'amount_inr', 'payment_method'];
  const present = new Set(fieldByCol.values());
  const missing = required.filter((f) => !present.has(f));
  if (missing.length) {
    return {
      rows: [],
      parseErrors: [{ rowNumber: 1, reason: `Missing required columns: ${missing.join(', ')}` }],
    };
  }

  const rows: HistoricalSalesRow[] = [];
  const parseErrors: ParsedHistoricalImport['parseErrors'] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0) continue;

    const raw: Record<string, unknown> = {};
    let hasData = false;
    fieldByCol.forEach((field, col) => {
      const val = cellValue(row.getCell(col));
      if (val != null && String(val).trim() !== '') hasData = true;
      raw[field] = val;
    });
    if (!hasData) continue;

    const transactionDate = parseExcelDate(raw.transaction_date);
    const amountPaise = parseInrToPaise(raw.amount_inr);
    const discountPaise = parseInrToPaise(raw.discount_inr) ?? 0;
    const paymentMethod = parsePaymentMethod(String(raw.payment_method ?? ''));
    const gstRaw = raw.gst_percent;
    const gstBps =
      gstRaw != null && String(gstRaw).trim() !== ''
        ? Math.round(Number(gstRaw) * 100)
        : defaultGstBps;
    const quantity = Math.max(1, Number(raw.quantity ?? 1) || 1);

    if (!transactionDate) {
      parseErrors.push({ rowNumber: r, reason: 'Invalid transaction_date' });
      continue;
    }
    if (amountPaise == null) {
      parseErrors.push({ rowNumber: r, reason: 'Invalid amount_inr' });
      continue;
    }
    if (!paymentMethod) {
      parseErrors.push({ rowNumber: r, reason: 'Invalid payment_method' });
      continue;
    }

    rows.push({
      rowNumber: r,
      rowId: raw.row_id != null ? String(raw.row_id).trim() : undefined,
      transactionDate,
      customerName: String(raw.customer_name ?? '').trim(),
      customerPhone: raw.customer_phone != null ? String(raw.customer_phone).trim() : undefined,
      description: String(raw.description ?? '').trim(),
      amountPaise,
      discountPaise,
      paymentMethod,
      gstBps: Number.isFinite(gstBps) ? gstBps : defaultGstBps,
      quantity,
      originalInvoiceRef:
        raw.original_invoice_ref != null ? String(raw.original_invoice_ref).trim() : undefined,
    });
  }

  return { rows, parseErrors };
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

async function findExistingInvoiceByRowKey(rowKey: string) {
  const [inv] = await hairDb
    .select({ id: fyhInvoices.id })
    .from(fyhInvoices)
    .where(eq(fyhInvoices.importRowKey, rowKey))
    .limit(1);
  return inv ?? null;
}

async function persistHistoricalRow(
  db: typeof hairDb,
  batchId: string,
  row: HistoricalSalesRow,
): Promise<{ imported: boolean; skipped: boolean; revenuePaise: number; gstPaise: number }> {
  const rowKey = computeImportRowKey(row);
  const validationError = validateHistoricalRow(row);
  if (validationError) {
    throw new Error(validationError);
  }

  const existing = await findExistingInvoiceByRowKey(rowKey);
  if (existing) {
    return { imported: false, skipped: true, revenuePaise: 0, gstPaise: 0 };
  }

  const priced = priceHistoricalLine({
    description: row.description,
    amountPaise: row.amountPaise,
    discountPaise: row.discountPaise,
    gstBps: row.gstBps,
    quantity: row.quantity,
  });

  if (Math.abs(priced.finalLinePaise - row.amountPaise) > 1) {
    throw new Error(
      `Amount mismatch after GST math: expected ₹${(row.amountPaise / 100).toFixed(2)}, got ₹${(priced.finalLinePaise / 100).toFixed(2)}`,
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
      subtotalPaise: priced.basePaise,
      discountPaise: priced.discountPaise,
      taxPaise: priced.gstPaise,
      grandTotalPaise: priced.finalLinePaise,
      amountPaidPaise: priced.finalLinePaise,
      notes,
      importBatchId: batchId,
      importRowKey: rowKey,
      paidAt: occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    })
    .returning();

  if (!inv) throw new Error('Failed to create historical invoice');

  const unitSellingPricePaise = Math.round((row.amountPaise + row.discountPaise) / priced.quantity);

  await db.insert(fyhInvoiceLines).values({
    invoiceId: inv.id,
    kind: 'custom',
    staffId: null,
    nameSnapshot: priced.description,
    quantity: priced.quantity,
    unitPricePaise: unitSellingPricePaise,
    discountPaise: priced.discountPaise,
    discountBps: priced.discountBps,
    gstBps: priced.gstBps,
    taxPaise: priced.gstPaise,
    lineTotalPaise: priced.finalLinePaise,
    sortOrder: 0,
    createdAt: occurredAt,
  });

  await db.insert(fyhInvoicePayments).values({
    invoiceId: inv.id,
    method: row.paymentMethod,
    amountPaise: priced.finalLinePaise,
    reference: row.originalInvoiceRef ?? null,
    notes: 'Historical import',
    paidAt: occurredAt,
    createdAt: occurredAt,
  });

  const ledgerPlan = buildHistoricalLedgerPlan({
    customerId: customer.id,
    grandTotalPaise: priced.finalLinePaise,
    paymentMethod: row.paymentMethod,
  });

  await postLedgerEntries(db, {
    customerId: customer.id,
    invoiceId: inv.id,
    entries: ledgerPlan,
    occurredAt,
  });

  return {
    imported: true,
    skipped: false,
    revenuePaise: priced.finalLinePaise,
    gstPaise: priced.gstPaise,
  };
}

export async function importHistoricalSales(
  opts: ImportHistoricalOptions,
): Promise<ImportHistoricalResult> {
  const fileSha256 = sha256(opts.buffer);
  const parsed = await parseHistoricalSalesExcel(opts.buffer);

  const summary: HistoricalImportSummary = {
    totalRows: parsed.rows.length,
    imported: 0,
    skipped: 0,
    failed: parsed.parseErrors.length,
    totalRevenuePaise: 0,
    totalGstPaise: 0,
    failedRows: parsed.parseErrors.map((e) => ({
      rowNumber: e.rowNumber,
      reason: e.reason,
    })),
  };

  if (!opts.force) {
    const existingBatch = await findExistingBatch(fileSha256);
    if (existingBatch?.summary) {
      return {
        batchId: existingBatch.id,
        summary: existingBatch.summary,
        skippedExistingBatch: true,
      };
    }
  }

  if (opts.dryRun) {
    for (const row of parsed.rows) {
      const err = validateHistoricalRow(row);
      if (err) {
        summary.failed += 1;
        summary.failedRows.push({ rowNumber: row.rowNumber, rowKey: computeImportRowKey(row), reason: err });
        continue;
      }
      const priced = priceHistoricalLine({
        description: row.description,
        amountPaise: row.amountPaise,
        discountPaise: row.discountPaise,
        gstBps: row.gstBps,
        quantity: row.quantity,
      });
      summary.imported += 1;
      summary.totalRevenuePaise += priced.finalLinePaise;
      summary.totalGstPaise += priced.gstPaise;
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

    for (const row of parsed.rows) {
      try {
        const result = await persistHistoricalRow(db, batch.id, row);
        if (result.skipped) {
          summary.skipped += 1;
        } else if (result.imported) {
          summary.imported += 1;
          summary.totalRevenuePaise += result.revenuePaise;
          summary.totalGstPaise += result.gstPaise;
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
      }
    }

    for (const pe of parsed.parseErrors) {
      await db.insert(fyhHistoricalImportRowErrors).values({
        batchId: batch.id,
        rowNumber: pe.rowNumber,
        errorMessage: pe.reason,
      });
    }

    const status = summary.failed > 0 && summary.imported === 0 ? 'failed' : 'completed';
    await db
      .update(fyhHistoricalImportBatches)
      .set({
        status,
        summary,
        completedAt: new Date(),
      })
      .where(eq(fyhHistoricalImportBatches.id, batch.id));

    console.info(
      `historical_import batch=${batch.id} imported=${summary.imported} skipped=${summary.skipped} failed=${summary.failed}`,
    );

    return batch.id;
  });

  return { batchId, summary };
}

export async function previewHistoricalSales(buffer: Buffer) {
  return parseHistoricalSalesExcel(buffer);
}

export async function getHistoricalImportBatch(batchId: string) {
  const [batch] = await hairDb
    .select()
    .from(fyhHistoricalImportBatches)
    .where(eq(fyhHistoricalImportBatches.id, batchId))
    .limit(1);
  return batch ?? null;
}
