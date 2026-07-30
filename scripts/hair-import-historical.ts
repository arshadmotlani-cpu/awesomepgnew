/**
 * Import historical salon sales from Excel (Final Bills or standard template).
 *
 * Usage:
 *   npm run hair:import:historical -- "/path/to/Final Bills.xlsx"
 *   npm run hair:import:historical -- file.xlsx --dry-run
 *   npm run hair:import:historical -- file.xlsx --force
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadAppEnv } from '../src/lib/db/loadEnv';

loadAppEnv();

const DEFAULT_EXPORT_DIR = 'docs/foryourhair/imports/output';
const DEFAULT_PDF_DIR = 'docs/foryourhair/imports/output/pdfs';

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith('--'));
  if (!filePath) {
    console.error(
      'Usage: npm run hair:import:historical -- <file.xlsx> [--dry-run] [--force] [--export-dir=path]',
    );
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const exportDirArg = args.find((a) => a.startsWith('--export-dir='));
  const exportDir = exportDirArg?.slice('--export-dir='.length) ?? DEFAULT_EXPORT_DIR;
  const pdfDir = path.join(exportDir, 'pdfs');

  const buffer = await readFile(filePath);
  const fileName = filePath.split('/').pop() ?? 'import.xlsx';

  const { importHistoricalSales } = await import('../src/hair/services/historicalImport');
  const result = await importHistoricalSales({
    fileName,
    buffer,
    dryRun,
    force,
    pdfOutputDir: dryRun ? undefined : pdfDir,
  });

  console.log('\n=== Historical Import Report ===\n');
  console.log(`File: ${fileName}`);
  console.log(`Batch ID: ${result.batchId ?? '—'}`);
  if (result.skippedExistingBatch) {
    console.log('Status: SKIPPED (identical file already imported)');
  } else if (result.validationFailed) {
    console.log('Status: ABORTED (validation failed)');
  } else if (dryRun) {
    console.log('Status: DRY RUN (no data written)');
  } else {
    console.log('Status: COMPLETED');
  }

  const s = result.summary;
  console.log('\n--- Counts ---');
  console.log(`Total rows: ${s.totalRows}`);
  console.log(`Imported:   ${s.imported}`);
  console.log(`Skipped:    ${s.skipped}`);
  console.log(`Failed:     ${s.failed}`);

  console.log('\n--- Revenue ---');
  console.log(`Total revenue: ${inr(s.totalRevenuePaise)}`);
  console.log(`GST collected: ${inr(s.totalGstPaise)}`);
  if (s.cashTotalPaise != null) console.log(`Cash total:    ${inr(s.cashTotalPaise)}`);
  if (s.upiTotalPaise != null) console.log(`UPI total:     ${inr(s.upiTotalPaise)}`);

  if (s.validation) {
    const v = s.validation;
    console.log('\n--- Validation ---');
    console.log(`Passed: ${v.passed ? 'YES' : 'NO'}`);
    console.log(`Excel rows: ${v.excelRowCount} | Parsed rows: ${v.parsedRowCount}`);
    console.log(`Excel revenue: ${inr(v.excelRevenuePaise)}`);
    console.log(`Excel cash:    ${inr(v.excelCashPaise)} | UPI: ${inr(v.excelUpiPaise)}`);
    for (const err of v.errors) {
      console.log(`  ✗ ${err}`);
    }
  }

  if (s.failedRows.length) {
    console.log('\n--- Failures ---');
    for (const f of s.failedRows.slice(0, 20)) {
      console.log(`  Row ${f.rowNumber}: ${f.reason}${f.rowKey ? ` [${f.rowKey}]` : ''}`);
    }
    if (s.failedRows.length > 20) {
      console.log(`  … and ${s.failedRows.length - 20} more`);
    }
  }

  if (result.batchId && !dryRun && !result.validationFailed) {
    const { exportHistoricalImportRegisters, fetchRegisterRows } = await import(
      '../src/hair/services/historicalImportExport'
    );
    await mkdir(exportDir, { recursive: true });
    const rows = await fetchRegisterRows(result.batchId);
    const registers = await exportHistoricalImportRegisters(result.batchId, rows);
    console.log('\n--- Export files ---');
    for (const [name, buf] of registers) {
      const outPath = path.join(exportDir, name);
      await writeFile(outPath, buf);
      console.log(`  ${outPath}`);
    }
    const reportPath = path.join(exportDir, 'import-report.json');
    await writeFile(reportPath, JSON.stringify(result, null, 2));
    console.log(`  ${reportPath}`);
    console.log(`  PDF HTML: ${pdfDir}/`);
  }

  console.log('\n');
  if (result.validationFailed || (s.failed > 0 && s.imported === 0)) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

