/**
 * Production verification for Invoice Register Excel summary exports.
 * Usage: npx tsx scripts/verify-prod-invoice-register-excel.ts
 */
import ExcelJS from 'exceljs';
import { loadAppEnv } from '../src/lib/db/loadEnv';
import { INR_EXCEL_NUM_FMT } from '../src/hair/lib/export/invoiceRegisterExcelSummary';

loadAppEnv();

const SUMMARY_LABELS = [
  'Total Invoices:',
  'Total Taxable Amount:',
  'Total GST:',
  'Grand Total:',
  'Total Paid Amount:',
] as const;

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

type SummaryCheck = {
  label: string;
  row: number;
  valueCol: number;
  formula?: string;
  result?: number;
  labelBold?: boolean;
  valueBold?: boolean;
  topBorder?: boolean;
  currency?: boolean;
};

function inspectSummary(sheet: ExcelJS.Worksheet): {
  blankRowBefore: number | null;
  checks: SummaryCheck[];
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const checks: SummaryCheck[] = [];
  let summaryStart: number | null = null;

  for (let r = 1; r <= sheet.lastRow!.number; r++) {
    const label = sheet.getCell(r, 6).value;
    if (label === 'Total Invoices:') {
      summaryStart = r;
      break;
    }
  }

  if (!summaryStart) {
    return { blankRowBefore: null, checks, ok: false, issues: ['Missing summary section'] };
  }

  const blankRowBefore = summaryStart - 1;
  const blankRow = sheet.getRow(blankRowBefore);
  let blankOk = true;
  blankRow.eachCell({ includeEmpty: false }, () => {
    blankOk = false;
  });
  if (!blankOk) {
    issues.push(`Row ${blankRowBefore} before summary is not blank`);
  }

  const valueCols: Record<string, number> = {
    'Total Invoices:': 7,
    'Total Taxable Amount:': 7,
    'Total GST:': 8,
    'Grand Total:': 9,
    'Total Paid Amount:': 10,
  };

  for (let i = 0; i < SUMMARY_LABELS.length; i++) {
    const labelText = SUMMARY_LABELS[i]!;
    const row = summaryStart + i;
    const labelCell = sheet.getCell(row, 6);
    const valueCol = valueCols[labelText]!;
    const valueCell = sheet.getCell(row, valueCol);

    if (labelCell.value !== labelText) {
      issues.push(`Row ${row}: expected label "${labelText}", got ${String(labelCell.value)}`);
    }

    const val = valueCell.value;
    const formula =
      val && typeof val === 'object' && 'formula' in val
        ? (val as ExcelJS.CellFormulaValue).formula
        : undefined;
    const result =
      val && typeof val === 'object' && 'result' in val
        ? (val as ExcelJS.CellFormulaValue).result
        : undefined;

    if (!formula) {
      issues.push(`Row ${row}: value is not formula-driven (${JSON.stringify(val)})`);
    }

    const labelBold = labelCell.font?.bold === true;
    const valueBold = valueCell.font?.bold === true;
    const topBorder = labelCell.border?.top?.style === 'thin';
    const currency = valueCell.numFmt === INR_EXCEL_NUM_FMT;

    if (!labelBold) issues.push(`Row ${row}: label not bold`);
    if (!valueBold) issues.push(`Row ${row}: value not bold`);
    if (i === 0 && !topBorder) issues.push(`Row ${row}: missing top border`);
    if (labelText !== 'Total Invoices:' && !currency) {
      issues.push(`Row ${row}: missing ₹ currency format`);
    }

    checks.push({
      label: labelText,
      row,
      valueCol,
      formula,
      result: typeof result === 'number' ? result : undefined,
      labelBold,
      valueBold,
      topBorder: i === 0 ? topBorder : undefined,
      currency: labelText === 'Total Invoices:' ? undefined : currency,
    });
  }

  return { blankRowBefore, checks, ok: issues.length === 0, issues };
}

async function main() {
  const { queryInvoiceRegisterForExport } = await import(
    '../src/hair/services/invoiceRegisterQueries'
  );
  const { exportInvoiceRegisterExcel } = await import('../src/hair/services/invoiceRegisterExport');
  const { computeRegisterSummaryTotals } = await import(
    '../src/hair/lib/export/invoiceRegisterExcelSummary'
  );
  const { fetchRegisterRows, exportHistoricalImportRegisters } = await import(
    '../src/hair/services/historicalImportExport'
  );
  const { hairDb } = await import('../src/hair/db/client');
  const { fyhHistoricalImportBatches } = await import('../src/hair/db/schema/historicalImport');
  const { fyhInvoices } = await import('../src/hair/db/schema/billing');
  const { count, eq, ilike } = await import('drizzle-orm');

  console.log('=== Production Invoice Register Excel verification ===\n');

  const rows = await queryInvoiceRegisterForExport({}, 50_000);
  const expected = computeRegisterSummaryTotals(
    rows.map((r) => ({
      taxable: r.taxablePaise / 100,
      gst: r.gstPaise / 100,
      grandTotal: r.grandTotalPaise / 100,
      paid: r.paidPaise / 100,
    })),
  );

  const erpBuf = await exportInvoiceRegisterExcel(rows);
  const erpWb = new ExcelJS.Workbook();
  await erpWb.xlsx.load(erpBuf);
  const erpSheet = erpWb.getWorksheet('Invoice Register')!;
  const erpSummary = inspectSummary(erpSheet);

  console.log('1. ERP Invoice Register export');
  console.log(`   Rows exported: ${rows.length}`);
  console.log(`   Expected grand total: ${fmt(expected.grandTotal)}`);
  console.log(`   Summary OK: ${erpSummary.ok ? 'YES' : 'NO'}`);
  if (!erpSummary.ok) console.log(`   Issues: ${erpSummary.issues.join('; ')}`);

  const grand = erpSummary.checks.find((c) => c.label === 'Grand Total:');
  const totalsMatch = grand?.result === expected.grandTotal;
  console.log(`   Totals match ERP data: ${totalsMatch ? 'YES' : 'NO'}`);

  const batches = await hairDb
    .select({ id: fyhHistoricalImportBatches.id, fileName: fyhHistoricalImportBatches.fileName })
    .from(fyhHistoricalImportBatches)
    .where(ilike(fyhHistoricalImportBatches.fileName, '%Final Bills%'));

  let batchId: string | undefined;
  for (const b of batches) {
    const [{ n }] = await hairDb
      .select({ n: count() })
      .from(fyhInvoices)
      .where(eq(fyhInvoices.importBatchId, b.id));
    if (Number(n) > 0) {
      batchId = b.id;
      break;
    }
  }

  if (!batchId) {
    console.log('\n2. Historical monthly/combined exports: skipped (no Final Bills batch with rows)');
  } else {
    const histRows = await fetchRegisterRows(batchId);
    const outputs = await exportHistoricalImportRegisters(batchId, histRows);
    console.log('\n2. Historical monthly/combined exports');
    let allMonthlyOk = true;

    for (const [name, buf] of outputs) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const sheet = wb.worksheets[0]!;
      const summary = inspectSummary(sheet);
      const monthRows = name.startsWith('Combined')
        ? histRows
        : histRows.filter((r) => {
            const d = new Date(`${r.invoiceDate}T12:00:00.000Z`);
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
            return months[d.getUTCMonth()] === name.split(' ')[0];
          });
      const exp = computeRegisterSummaryTotals(
        monthRows.map((r) => ({
          taxable: r.amountInr,
          gst: r.gstInr,
          grandTotal: r.grandTotalInr,
          paid: r.paidInr,
        })),
      );
      const g = summary.checks.find((c) => c.label === 'Grand Total:');
      const match = g?.result === exp.grandTotal;
      if (!summary.ok || !match) allMonthlyOk = false;
      console.log(
        `   ${name}: summary=${summary.ok ? 'OK' : 'FAIL'}, invoices=${exp.invoiceCount}, grand=${fmt(exp.grandTotal)}, match=${match ? 'YES' : 'NO'}`,
      );
      if (!summary.ok) console.log(`      ${summary.issues.join('; ')}`);
    }

    console.log(`   All monthly + combined OK: ${allMonthlyOk ? 'YES' : 'NO'}`);
  }

  console.log('\n3. Formula / formatting / compatibility notes');
  console.log('   - Values use COUNTA/SUM formulas with cached results (Excel repair-safe)');
  console.log(`   - Currency numFmt: ${INR_EXCEL_NUM_FMT}`);
  console.log('   - Compatible with Excel, Numbers, LibreOffice (standard OOXML formulas)');

  const prodUrl = 'https://fyhair.awesomepg.in/billing/invoices';
  const depUrl =
    'https://awesomepg-k59k-jf8kxqsux-arshadmotlani-3160s-projects.vercel.app';
  console.log('\n4. Production endpoints');
  console.log(`   Production URL: ${prodUrl}`);
  console.log(`   Deployment URL: ${depUrl}`);

  const allOk =
    erpSummary.ok &&
    totalsMatch &&
    erpSummary.checks.length === SUMMARY_LABELS.length &&
    erpSummary.checks.every((c) => c.formula);

  if (!allOk) process.exitCode = 1;
  else console.log('\n✓ Production verification passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
