/**
 * Verify Invoice Register Excel summary formulas match DB totals.
 * Usage: npx tsx scripts/verify-invoice-register-excel-summary.ts
 */
import ExcelJS from 'exceljs';
import { loadAppEnv } from '../src/lib/db/loadEnv';

loadAppEnv();

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

function readSummary(sheet: ExcelJS.Worksheet) {
  const out: Record<string, ExcelJS.CellFormulaValue | undefined> = {};
  for (let r = 1; r <= sheet.lastRow!.number; r++) {
    const label = sheet.getCell(r, 6).value;
    if (typeof label !== 'string') continue;
    const normalized = label.replace(':', '').trim();
    if (
      ![
        'Total Invoices',
        'Total Taxable Amount',
        'Total GST',
        'Grand Total',
        'Total Paid Amount',
      ].includes(normalized)
    ) {
      continue;
    }
    let col = 7;
    if (normalized === 'Total GST') col = 8;
    else if (normalized === 'Grand Total') col = 9;
    else if (normalized === 'Total Paid Amount') col = 10;
    const val = sheet.getCell(r, col).value;
    if (val && typeof val === 'object' && 'formula' in val) {
      out[normalized] = val as ExcelJS.CellFormulaValue;
    }
  }
  return out;
}

async function main() {
  const { queryInvoiceRegister, queryInvoiceRegisterForExport } = await import(
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
  const { fyhHistoricalImportBatches } = await import('../src/hair/db/schema');

  const register = await queryInvoiceRegister({ pageSize: 1, page: 1 });
  const rows = await queryInvoiceRegisterForExport({}, 50_000);
  const expectedAll = computeRegisterSummaryTotals(
    rows.map((r) => ({
      taxable: r.taxablePaise / 100,
      gst: r.gstPaise / 100,
      grandTotal: r.grandTotalPaise / 100,
      paid: r.paidPaise / 100,
    })),
  );

  const buf = await exportInvoiceRegisterExcel(rows);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheet = wb.getWorksheet('Invoice Register')!;
  const summary = readSummary(sheet);

  console.log('=== ERP Invoice Register Excel (all invoices) ===');
  console.log(`DB count: ${register.totalCount}, exported rows: ${rows.length}`);
  console.log(`Expected taxable: ${fmt(expectedAll.taxable)}`);
  console.log(`Expected GST: ${fmt(expectedAll.gst)}`);
  console.log(`Expected grand total: ${fmt(expectedAll.grandTotal)}`);
  console.log(`Expected paid: ${fmt(expectedAll.paid)}`);

  const checks = [
    ['Total Invoices', summary['Total Invoices']?.result, expectedAll.invoiceCount],
    ['Total Taxable Amount', summary['Total Taxable Amount']?.result, expectedAll.taxable],
    ['Total GST', summary['Total GST']?.result, expectedAll.gst],
    ['Grand Total', summary['Grand Total']?.result, expectedAll.grandTotal],
    ['Total Paid Amount', summary['Total Paid Amount']?.result, expectedAll.paid],
  ] as const;

  let allOk = true;
  for (const [name, actual, expected] of checks) {
    const ok = actual === expected;
    if (!ok) allOk = false;
    console.log(`${ok ? '✓' : '✗'} ${name}: ${actual} (expected ${expected})`);
  }
  if (!allOk) process.exitCode = 1;

  const batches = await hairDb
    .select({ id: fyhHistoricalImportBatches.id, name: fyhHistoricalImportBatches.fileName })
    .from(fyhHistoricalImportBatches);

  console.log(`\nHistorical batches found: ${batches.length}`);

  for (const b of batches) {
    const rows = await fetchRegisterRows(b.id);
    if (!rows.length) continue;
    const byMonth = new Map<string, typeof rows>();
    for (const row of rows) {
      const d = new Date(`${row.invoiceDate}T12:00:00.000Z`);
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
      const m = months[d.getUTCMonth()] ?? 'Unknown';
      const list = byMonth.get(m) ?? [];
      list.push(row);
      byMonth.set(m, list);
    }

    const outputs = await exportHistoricalImportRegisters(b.id, rows);
    console.log(`\n=== Batch ${b.id.slice(0, 8)} (${b.name}) ===`);

    for (const [name, fileBuf] of outputs) {
      const mwb = new ExcelJS.Workbook();
      await mwb.xlsx.load(fileBuf);
      const ws = mwb.worksheets[0]!;
      const monthRows = name.startsWith('Combined')
        ? rows
        : (byMonth.get(name.split(' ')[0]!) ?? []);
      const exp = computeRegisterSummaryTotals(
        monthRows.map((r) => ({
          taxable: r.amountInr,
          gst: r.gstInr,
          grandTotal: r.grandTotalInr,
          paid: r.paidInr,
        })),
      );
      const sm = readSummary(ws);
      const grand = sm['Grand Total']?.result;
      const ok = grand === exp.grandTotal;
      if (!ok) process.exitCode = 1;
      console.log(
        `${ok ? '✓' : '✗'} ${name}: ${exp.invoiceCount} invoices, grand ${fmt(exp.grandTotal)}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
