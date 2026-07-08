import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { invoicePdfFilename } from '../../src/lib/billing/invoicePdf';

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

test('invoicePdfFilename sanitizes invoice numbers for Content-Disposition', () => {
  assert.equal(invoicePdfFilename('RNT-2026-07-0009'), 'RNT-2026-07-0009.pdf');
  assert.equal(invoicePdfFilename('ELE-2026-07-0002'), 'ELE-2026-07-0002.pdf');
  assert.equal(invoicePdfFilename('INV/2026\\test'), 'INV-2026-test.pdf');
});

test('SSOT invoice PDF generator and download routes exist', () => {
  const pdf = read('src/lib/billing/invoicePdf.ts');
  assert.match(pdf, /export async function generateInvoicePdf/);
  assert.match(pdf, /Awesome PG/);
  assert.match(pdf, /Balance due/);

  const download = read('src/lib/billing/invoicePdfDownload.ts');
  assert.match(download, /application\/pdf/);
  assert.match(download, /Content-Disposition/);
  assert.match(download, /getInvoiceDocumentDetail/);

  const links = read('src/lib/billing/invoicePdfLinks.ts');
  assert.match(links, /invoicePdfDownloadHref/);

  assert.match(read('app/api/invoices/[ref]/pdf/route.ts'), /loadInvoicePdfBytesByRef/);
  assert.match(read('app/api/invoices/share/[shareToken]/pdf/route.ts'), /resolveInvoiceIdByShareToken/);
});

test('admin Download PDF points at API route not print page', () => {
  const adminPage = read('app/(admin)/admin/invoices/[invoiceId]/page.tsx');
  assert.match(adminPage, /invoicePdfDownloadHref/);
  assert.match(adminPage, /pdfHref=/);

  const toolbar = read('src/components/admin/FinancialDocumentToolbar.tsx');
  assert.match(toolbar, /pdfHref/);
  assert.doesNotMatch(toolbar, /Download PDF[\s\S]*href=\{printHref\}/);
});

test('resident surfaces expose Download PDF links', () => {
  assert.match(read('app/i/[shareToken]/page.tsx'), /InvoicePdfDownloadLink/);
  assert.match(read('src/components/customer/account/resident/ResidentPaymentsHub.tsx'), /invoicePdfDownloadHref/);
});
