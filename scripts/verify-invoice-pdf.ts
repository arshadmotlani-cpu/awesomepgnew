/* eslint-disable no-console */
/**
 * Generate sample invoice PDFs for manual inspection.
 * Usage: DATABASE_URL=... npx tsx scripts/verify-invoice-pdf.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb, db } from '../src/db/client';
import { financialInvoices } from '../src/db/schema';
import { generateInvoicePdf, invoicePdfFilename } from '../src/lib/billing/invoicePdf';
import { getInvoiceDocumentDetail } from '../src/lib/billing/invoiceDocumentModel';

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const rows = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      invoiceType: financialInvoices.invoiceType,
    })
    .from(financialInvoices)
    .limit(20);

  const byType = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    if (!byType.has(row.invoiceType)) byType.set(row.invoiceType, row);
  }

  const outDir = join(process.cwd(), '.invoice-pdf-samples');
  mkdirSync(outDir, { recursive: true });

  let generated = 0;
  for (const row of byType.values()) {
    const doc = await getInvoiceDocumentDetail(row.id);
    if (!doc) {
      console.warn('skip — no document', row.invoiceNumber);
      continue;
    }
    const bytes = await generateInvoicePdf(doc);
    const filename = invoicePdfFilename(doc.invoiceNumber);
    const path = join(outDir, filename);
    writeFileSync(path, bytes);
    const header = Buffer.from(bytes.slice(0, 5)).toString('utf8');
    console.log('OK', row.invoiceType, filename, `bytes=${bytes.length}`, `header=${header}`);
    if (header !== '%PDF-') throw new Error(`Invalid PDF header for ${filename}`);
    if (bytes.length < 500) throw new Error(`PDF too small for ${filename}`);
    generated += 1;
  }

  if (generated === 0) {
    throw new Error('No invoice PDFs generated — database may be empty');
  }
  console.log(`\nPASS — ${generated} sample PDF(s) in ${outDir}`);
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exit(1);
  })
  .finally(() => closeDb());
