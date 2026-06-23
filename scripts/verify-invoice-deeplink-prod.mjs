/**
 * Production invoice deep-link verification (network + optional DB when DATABASE_URL is set).
 *
 * Usage:
 *   node scripts/verify-invoice-deeplink-prod.mjs
 *   DATABASE_URL='postgres://…' node scripts/verify-invoice-deeplink-prod.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.PROD_BASE_URL ?? 'https://www.awesomepg.in';
const INVOICE_ID = process.env.INVOICE_ID ?? 'aa8b65f9-4726-4ee4-b074-8cb3c8827665';
const INVOICE_NUMBER = process.env.INVOICE_NUMBER ?? 'RNT-2026-06-0019';
const OUT = join(process.cwd(), 'artifacts/invoice-deeplink-verify');

mkdirSync(OUT, { recursive: true });

const report = {
  base: BASE,
  invoiceId: INVOICE_ID,
  invoiceNumber: INVOICE_NUMBER,
  verifiedAt: new Date().toISOString(),
  checks: {},
  network: [],
};

async function verifyHttpRoute() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const chain = [];
  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('awesomepg.in')) return;
    if (url.includes('_next/static') || url.includes('.woff')) return;
    chain.push({
      url: url.replace(BASE, ''),
      status: res.status(),
      redirectedFrom: res.request().redirectedFrom()?.url()?.replace(BASE, '') ?? null,
    });
  });

  await page.goto(`${BASE}/resident/invoices/${INVOICE_ID}`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });

  const finalUrl = page.url();
  const nextParam = new URL(finalUrl).searchParams.get('next');
  const statuses = chain.map((r) => r.status);
  const redirectLoop =
    chain.filter((r) => r.status >= 300 && r.status < 400).length > 3 ||
    chain.filter((r) => r.url.startsWith('/login')).length > 2;

  report.checks.route = {
    pass:
      !statuses.includes(404) &&
      chain.some((r) => r.url.startsWith('/resident/invoices/') && r.status === 307) &&
      finalUrl.includes('/login') &&
      nextParam === `/resident/invoices/${INVOICE_ID}`,
    finalUrl,
    nextParam,
    redirectCount: chain.filter((r) => r.status >= 300 && r.status < 400).length,
    redirectLoop,
    saw404: statuses.includes(404),
  };
  report.network = chain;

  await browser.close();
}

async function verifyDatabase() {
  if (!process.env.DATABASE_URL) {
    report.checks.database = { skipped: true, reason: 'DATABASE_URL not set locally' };
    return;
  }

  const { createClient, closeDb } = await import('../src/db/client.ts');
  const { financialInvoices } = await import('../src/db/schema/financialInvoices.ts');
  const { customers } = await import('../src/db/schema/customers.ts');
  const { eq } = await import('drizzle-orm');

  const { db } = createClient({ max: 1 });
  const [row] = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      status: financialInvoices.status,
      customerId: financialInvoices.customerId,
      customerName: customers.fullName,
    })
    .from(financialInvoices)
    .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
    .where(eq(financialInvoices.id, INVOICE_ID))
    .limit(1);

  report.checks.database = row
    ? { pass: true, exists: true, status: row.status, customerId: row.customerId, customerName: row.customerName }
    : { pass: false, exists: false };

  await closeDb();
}

await verifyHttpRoute();
await verifyDatabase();

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.checks.route?.pass ? 0 : 1);
