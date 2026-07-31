import type ExcelJS from 'exceljs';

/** INR currency — quoted rupee prefix works in Excel, Numbers, and LibreOffice. */
export const INR_EXCEL_NUM_FMT = '"₹"#,##0.00';

export type InvoiceRegisterSummaryColumns = {
  invoiceNumberCol: number;
  taxableCol: number;
  gstCol: number;
  grandTotalCol: number;
  paidCol: number;
  /** Column for summary labels (default 6 — left of amount block). */
  labelCol?: number;
};

function colLetter(col: number): string {
  let n = col;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function range(col: number, firstRow: number, lastRow: number): string {
  return `${colLetter(col)}${firstRow}:${colLetter(col)}${lastRow}`;
}

const thinTopBorder: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };

function styleSummaryLabel(cell: ExcelJS.Cell, withTopBorder: boolean) {
  cell.font = { bold: true };
  if (withTopBorder) {
    cell.border = { top: thinTopBorder };
  }
}

function styleSummaryValue(cell: ExcelJS.Cell, withTopBorder: boolean, currency = false) {
  cell.font = { bold: true };
  if (currency) cell.numFmt = INR_EXCEL_NUM_FMT;
  if (withTopBorder) {
    cell.border = { top: thinTopBorder };
  }
}

/**
 * Append a formula-driven revenue summary below invoice register data.
 * Leaves one blank row, then labels in `labelCol` with values under amount columns.
 */
export type SummaryCachedResults = {
  invoiceCount: number;
  taxable: number;
  gst: number;
  grandTotal: number;
  paid: number;
};

export function appendInvoiceRegisterExcelSummary(
  sheet: ExcelJS.Worksheet,
  firstDataRow: number,
  lastDataRow: number,
  columns: InvoiceRegisterSummaryColumns,
  cached?: SummaryCachedResults,
): number {
  const labelCol = columns.labelCol ?? 6;
  const dataEnd = Math.max(lastDataRow, firstDataRow);

  sheet.addRow([]);

  const summaryStart = sheet.lastRow!.number + 1;

  const rows: Array<{
    label: string;
    valueCol: number;
    formula: string;
    currency: boolean;
    cachedKey?: keyof SummaryCachedResults;
  }> = [
    {
      label: 'Total Invoices:',
      valueCol: columns.taxableCol,
      formula: `COUNTA(${range(columns.invoiceNumberCol, firstDataRow, dataEnd)})`,
      currency: false,
      cachedKey: 'invoiceCount',
    },
    {
      label: 'Total Taxable Amount:',
      valueCol: columns.taxableCol,
      formula: `SUM(${range(columns.taxableCol, firstDataRow, dataEnd)})`,
      currency: true,
      cachedKey: 'taxable',
    },
    {
      label: 'Total GST:',
      valueCol: columns.gstCol,
      formula: `SUM(${range(columns.gstCol, firstDataRow, dataEnd)})`,
      currency: true,
      cachedKey: 'gst',
    },
    {
      label: 'Grand Total:',
      valueCol: columns.grandTotalCol,
      formula: `SUM(${range(columns.grandTotalCol, firstDataRow, dataEnd)})`,
      currency: true,
      cachedKey: 'grandTotal',
    },
    {
      label: 'Total Paid Amount:',
      valueCol: columns.paidCol,
      formula: `SUM(${range(columns.paidCol, firstDataRow, dataEnd)})`,
      currency: true,
      cachedKey: 'paid',
    },
  ];

  for (let i = 0; i < rows.length; i++) {
    const spec = rows[i]!;
    const row = sheet.addRow([]);
    const withBorder = i === 0;
    const labelCell = row.getCell(labelCol);
    labelCell.value = spec.label;
    styleSummaryLabel(labelCell, withBorder);

    const valueCell = row.getCell(spec.valueCol);
    const cachedResult =
      cached && spec.cachedKey !== undefined ? cached[spec.cachedKey] : undefined;
    valueCell.value =
      cachedResult !== undefined
        ? { formula: spec.formula, result: cachedResult }
        : { formula: spec.formula };
    styleSummaryValue(valueCell, withBorder, spec.currency);
  }

  return summaryStart;
}

/** Evaluate summary formulas in-process for tests (exceljs does not calc by default). */
export function computeRegisterSummaryTotals(
  rows: Array<{
    taxable: number;
    gst: number;
    grandTotal: number;
    paid: number;
  }>,
): {
  invoiceCount: number;
  taxable: number;
  gst: number;
  grandTotal: number;
  paid: number;
} {
  return {
    invoiceCount: rows.length,
    taxable: rows.reduce((s, r) => s + r.taxable, 0),
    gst: rows.reduce((s, r) => s + r.gst, 0),
    grandTotal: rows.reduce((s, r) => s + r.grandTotal, 0),
    paid: rows.reduce((s, r) => s + r.paid, 0),
  };
}
