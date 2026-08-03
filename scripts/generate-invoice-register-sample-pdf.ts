/**
 * Generate a multi-page sample Invoice Register PDF for visual/pagination QA.
 *
 * Usage: npx tsx scripts/generate-invoice-register-sample-pdf.ts
 * Writes:
 *   tmp/invoice-register-sample.html
 *   tmp/invoice-register-sample.pdf
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  computeInvoiceRegisterPdfSummary,
  renderInvoiceRegisterPdfHtml,
  resolveInvoiceRegisterPdfBranding,
} from '../src/hair/lib/export/invoiceRegisterPdf';
import { INVOICE_REGISTER_BRAND } from '../src/hair/lib/invoiceBranding';
import type { InvoiceRegisterRow } from '../src/hair/services/invoiceRegisterQueries';

const OUT_DIR = path.join(process.cwd(), 'tmp');
const HTML_PATH = path.join(OUT_DIR, 'invoice-register-sample.html');
const PDF_PATH = path.join(OUT_DIR, 'invoice-register-sample.pdf');

const SERVICES = [
  'Haircut & styling',
  'Keratin treatment',
  'Bridal makeup package',
  'Facial + clean-up',
  'Hair colour & highlights',
  'Spa manicure',
];
const CUSTOMERS = [
  'Ananya Sharma',
  'Priya Deshmukh',
  'Neha Kulkarni',
  'Ritu Mehta',
  'Sneha Patil',
  'Kavya Iyer',
];
const MODES = ['Cash', 'UPI', 'Card', 'Wallet'] as const;

function buildRows(count: number): InvoiceRegisterRow[] {
  const rows: InvoiceRegisterRow[] = [];
  for (let i = 0; i < count; i++) {
    const taxable = 80000 + (i % 7) * 15000;
    const gst = Math.round(taxable * 0.18);
    const total = taxable + gst;
    const partial = i % 11 === 0;
    rows.push({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      invoiceNumber: `FYH-${String(10001 + i).padStart(5, '0')}`,
      invoiceDate: new Date(Date.UTC(2026, 3, 1 + (i % 90), 6, 30)),
      customerName: CUSTOMERS[i % CUSTOMERS.length]!,
      mobile: `98${String(20000000 + i).slice(0, 8)}`,
      servicesSummary: SERVICES[i % SERVICES.length]!,
      paymentModes: MODES[i % MODES.length]!,
      taxablePaise: taxable,
      gstPaise: gst,
      grandTotalPaise: total,
      paidPaise: partial ? Math.round(total * 0.4) : total,
      status: partial ? 'partial' : 'paid',
    });
  }
  return rows;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const logoPath = path.join(process.cwd(), 'public/fyh/invoice-brand-logo.png');
  const logoB64 = (await readFile(logoPath)).toString('base64');
  const branding = {
    ...resolveInvoiceRegisterPdfBranding({
      businessName: 'For Your Hair',
      businessAddress:
        'Shop No. 16 & 17, Kamptee Road, Kadbi Chowk, Mangalam Shri Krupa Complex, Nagpur, Maharashtra 440004',
      gstin: '27AAAAA0000A1Z5',
      timezone: 'Asia/Kolkata',
      billingSettings: { businessEmail: 'accounts@fyhair.example' } as never,
      whatsappSettings: { businessPhone: '9823444886' } as never,
    }),
    logoUrl: `data:image/png;base64,${logoB64}`,
  };

  const rows = buildRows(48);
  const summary = computeInvoiceRegisterPdfSummary(rows, {
    cashPaise: rows.filter((r) => r.paymentModes === 'Cash').reduce((s, r) => s + r.paidPaise, 0),
    upiPaise: rows.filter((r) => r.paymentModes === 'UPI').reduce((s, r) => s + r.paidPaise, 0),
    cardPaise: rows.filter((r) => r.paymentModes === 'Card').reduce((s, r) => s + r.paidPaise, 0),
    walletPaise: rows.filter((r) => r.paymentModes === 'Wallet').reduce((s, r) => s + r.paidPaise, 0),
    otherPaise: 0,
  });

  const html = renderInvoiceRegisterPdfHtml({
    rows,
    branding,
    period: {
      from: new Date('2026-04-01T00:00:00+05:30'),
      to: new Date('2026-07-01T00:00:00+05:30'),
    },
    summary,
    generatedAt: new Date('2026-08-03T17:34:00+05:30'),
    autoPrint: false,
  });

  await writeFile(HTML_PATH, html, 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });

  const footerLeft = `${INVOICE_REGISTER_BRAND.displayName} · Invoice Register`;
  const footerRight = 'Generated from For Your Hair ERP · 03 Aug 2026 05:34 PM IST';

  await page.pdf({
    path: PDF_PATH,
    landscape: true,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
    headerTemplate: `<div style="width:100%;font-size:8px;color:#5a6a60;padding:0 12mm;font-family:Georgia,serif;display:flex;justify-content:space-between">
      <span>${INVOICE_REGISTER_BRAND.displayName} · Professional Invoice Register</span>
      <span>01 Apr 2026 – 30 Jun 2026</span>
    </div>`,
    footerTemplate: `<div style="width:100%;font-size:8px;color:#5a6a60;padding:0 12mm;font-family:Georgia,serif;display:flex;justify-content:space-between">
      <span>${footerLeft}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      <span>${footerRight}</span>
    </div>`,
  });

  const pdf = await readFile(PDF_PATH);
  const pageCountMatch = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  const pageCount = pageCountMatch?.length ?? 0;

  await browser.close();

  if (pageCount < 2) {
    throw new Error(`Expected multi-page PDF for pagination QA, got ${pageCount} page(s)`);
  }

  console.log(`Wrote ${HTML_PATH}`);
  console.log(`Wrote ${PDF_PATH} (${pageCount} pages, ${pdf.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
