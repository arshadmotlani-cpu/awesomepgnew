import ExcelJS from 'exceljs';
import {
  mapHeaderToField,
  parseExcelDate,
  parseInrToPaise,
  parsePaymentMethod,
  type HistoricalSalesRow,
} from '@/src/hair/domain/import/historicalInvoice';

export type ParsedHistoricalImport = {
  rows: HistoricalSalesRow[];
  parseErrors: Array<{ rowNumber: number; reason: string; sheetName?: string }>;
  excelStats: {
    rowCount: number;
    revenuePaise: number;
    cashPaise: number;
    upiPaise: number;
  };
};

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

function isFinalBillsSheet(sheet: ExcelJS.Worksheet): boolean {
  const headerRow = sheet.getRow(1);
  const headers = new Set<string>();
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    const field = mapHeaderToField(String(cellValue(cell) ?? ''));
    if (field) headers.add(field);
  });
  return (
    headers.has('transaction_date') &&
    headers.has('customer_name') &&
    headers.has('amount_inr') &&
    headers.has('payment_method') &&
    headers.has('description')
  );
}

function parseFinalBillsSheet(
  sheet: ExcelJS.Worksheet,
  defaultGstBps: number,
): ParsedHistoricalImport {
  const headerRow = sheet.getRow(1);
  const fieldByCol = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = String(cellValue(cell) ?? '').trim();
    const field = mapHeaderToField(header);
    if (field) fieldByCol.set(colNumber, field);
  });

  const rows: HistoricalSalesRow[] = [];
  const parseErrors: ParsedHistoricalImport['parseErrors'] = [];
  let excelRowCount = 0;
  let revenuePaise = 0;
  let cashPaise = 0;
  let upiPaise = 0;

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

    const paymentRaw = String(raw.payment_method ?? '').trim();
    if (!paymentRaw) continue;

    const transactionDate = parseExcelDate(raw.transaction_date);
    const amountPaise = parseInrToPaise(raw.amount_inr);
    const paymentMethod = parsePaymentMethod(paymentRaw);

    if (amountPaise != null) {
      excelRowCount += 1;
      revenuePaise += amountPaise;
      if (paymentMethod === 'cash') cashPaise += amountPaise;
      if (paymentMethod === 'upi') upiPaise += amountPaise;
    }

    if (!transactionDate) {
      parseErrors.push({ rowNumber: r, sheetName: sheet.name, reason: 'Invalid date' });
      continue;
    }
    if (amountPaise == null) {
      parseErrors.push({ rowNumber: r, sheetName: sheet.name, reason: 'Invalid amount' });
      continue;
    }
    if (!paymentMethod) {
      parseErrors.push({ rowNumber: r, sheetName: sheet.name, reason: 'Invalid payment type' });
      continue;
    }

    const serviceRaw = String(raw.description ?? '').trim();
    rows.push({
      rowNumber: r,
      sheetName: sheet.name,
      rowId: raw.row_id != null ? String(raw.row_id).trim() : undefined,
      transactionDate,
      customerName: String(raw.customer_name ?? '').trim(),
      customerPhone: raw.customer_phone != null ? String(raw.customer_phone).trim() : undefined,
      description: serviceRaw,
      lineItems: [],
      amountPaise,
      discountPaise: 0,
      paymentMethod,
      gstBps: defaultGstBps,
      quantity: 1,
      originalInvoiceRef:
        raw.original_invoice_ref != null ? String(raw.original_invoice_ref).trim() : undefined,
    });
  }

  return {
    rows,
    parseErrors,
    excelStats: { rowCount: excelRowCount, revenuePaise, cashPaise, upiPaise },
  };
}

export async function parseFinalBillsWorkbook(
  buffer: Buffer,
  defaultGstBps: number,
): Promise<ParsedHistoricalImport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const allRows: HistoricalSalesRow[] = [];
  const parseErrors: ParsedHistoricalImport['parseErrors'] = [];
  let rowCount = 0;
  let revenuePaise = 0;
  let cashPaise = 0;
  let upiPaise = 0;

  const sheets = workbook.worksheets.filter(isFinalBillsSheet);
  if (!sheets.length) {
    return {
      rows: [],
      parseErrors: [{ rowNumber: 0, reason: 'No worksheets match Final Bills column layout' }],
      excelStats: { rowCount: 0, revenuePaise: 0, cashPaise: 0, upiPaise: 0 },
    };
  }

  for (const sheet of sheets) {
    const parsed = parseFinalBillsSheet(sheet, defaultGstBps);
    allRows.push(...parsed.rows);
    parseErrors.push(...parsed.parseErrors);
    rowCount += parsed.excelStats.rowCount;
    revenuePaise += parsed.excelStats.revenuePaise;
    cashPaise += parsed.excelStats.cashPaise;
    upiPaise += parsed.excelStats.upiPaise;
  }

  return {
    rows: allRows,
    parseErrors,
    excelStats: { rowCount, revenuePaise, cashPaise, upiPaise },
  };
}

export async function parseStandardHistoricalSheet(
  buffer: Buffer,
  defaultGstBps: number,
): Promise<ParsedHistoricalImport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      rows: [],
      parseErrors: [{ rowNumber: 0, reason: 'Workbook has no worksheets' }],
      excelStats: { rowCount: 0, revenuePaise: 0, cashPaise: 0, upiPaise: 0 },
    };
  }

  const parsed = parseFinalBillsSheet(sheet, defaultGstBps);
  return parsed;
}

export async function parseHistoricalSalesWorkbook(
  buffer: Buffer,
  defaultGstBps: number,
): Promise<ParsedHistoricalImport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const finalBillsSheets = workbook.worksheets.filter(isFinalBillsSheet);

  if (finalBillsSheets.length > 0) {
    return parseFinalBillsWorkbook(buffer, defaultGstBps);
  }

  return parseStandardHistoricalSheet(buffer, defaultGstBps);
}

