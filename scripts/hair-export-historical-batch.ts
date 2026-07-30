/**
 * Generate export registers and invoice PDF HTML for a completed import batch.
 * Usage: npx tsx scripts/hair-export-historical-batch.ts <batchId>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { loadAppEnv } from '../src/lib/db/loadEnv';

loadAppEnv();

async function main() {
  const batchId = process.argv[2];
  if (!batchId) {
    console.error('Usage: npx tsx scripts/hair-export-historical-batch.ts <batchId>');
    process.exit(1);
  }

  const exportDir = 'docs/foryourhair/imports/output';
  const pdfDir = path.join(exportDir, 'pdfs');
  await mkdir(pdfDir, { recursive: true });

  const { exportHistoricalImportRegisters, fetchRegisterRows } = await import(
    '../src/hair/services/historicalImportExport'
  );
  const { buildInvoicePrintHtml, getInvoiceDetail } = await import('../src/hair/services/invoices');
  const { hairDb } = await import('../src/hair/db/client');
  const { fyhInvoices } = await import('../src/hair/db/schema');

  const rows = await fetchRegisterRows(batchId);
  console.log(`Register rows: ${rows.length}`);

  const registers = await exportHistoricalImportRegisters(batchId, rows);
  await mkdir(exportDir, { recursive: true });
  for (const [name, buf] of registers) {
    const outPath = path.join(exportDir, name);
    await writeFile(outPath, buf);
    console.log(`Wrote ${outPath}`);
  }

  const invoices = await hairDb
    .select({ id: fyhInvoices.id, invoiceNumber: fyhInvoices.invoiceNumber })
    .from(fyhInvoices)
    .where(eq(fyhInvoices.importBatchId, batchId));

  let pdfCount = 0;
  for (const inv of invoices) {
    const detail = await getInvoiceDetail(inv.id);
    if (!detail) continue;
    const html = buildInvoicePrintHtml(detail);
    await writeFile(path.join(pdfDir, `${inv.invoiceNumber}.html`), html, 'utf8');
    pdfCount += 1;
  }
  console.log(`Wrote ${pdfCount} invoice HTML files to ${pdfDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
