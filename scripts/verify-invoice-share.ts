#!/usr/bin/env npx tsx
/**
 * Verify invoice share URL for a financial_invoice row.
 *
 *   npx tsx scripts/verify-invoice-share.ts
 *   npx tsx scripts/verify-invoice-share.ts --id=eaaa5e42-0c84-46da-937e-fbd2b93ce885
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { financialInvoices } from '@/src/db/schema';
import { getInvoiceDocumentDetail } from '@/src/lib/billing/invoiceDocumentModel';
import {
  ensureInvoiceShareToken,
  invoicePublicSharePath,
  resolveInvoiceIdByShareToken,
} from '@/src/lib/billing/invoiceShareToken';
import {
  buildInvoiceAdminUrl,
  buildInvoicePublicUrl,
  buildInvoicePublicUrlForInvoice,
} from '@/src/lib/billing/sendInvoiceOnWhatsApp';
import { getAppUrl } from '@/src/lib/url';

const INVOICE_ID = process.argv.find((a) => a.startsWith('--id='))?.split('=')[1]
  ?? 'eaaa5e42-0c84-46da-937e-fbd2b93ce885';

async function main() {
  console.log('═'.repeat(60));
  console.log('INVOICE SHARE URL VERIFICATION');
  console.log('═'.repeat(60));
  console.log(`Invoice ID: ${INVOICE_ID}\n`);

  const [row] = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      shareToken: financialInvoices.shareToken,
      status: financialInvoices.status,
    })
    .from(financialInvoices)
    .where(eq(financialInvoices.id, INVOICE_ID))
    .limit(1);

  if (!row) {
    console.error('FAIL — financial_invoice not found');
    process.exit(1);
  }

  const shareToken = await ensureInvoiceShareToken(INVOICE_ID);
  const base = getAppUrl();
  const sharePath = invoicePublicSharePath(shareToken);
  const shareUrl = buildInvoicePublicUrl(shareToken, base);
  const adminUrl = buildInvoiceAdminUrl(INVOICE_ID, base);
  const whatsAppUrl = await buildInvoicePublicUrlForInvoice(INVOICE_ID, base);

  const resolvedId = await resolveInvoiceIdByShareToken(shareToken);
  const document = await getInvoiceDocumentDetail(INVOICE_ID);

  const checks = [
    ['share_token persisted', Boolean(shareToken)],
    ['share path is /i/{token}', sharePath.startsWith('/i/') && !sharePath.includes(INVOICE_ID)],
    ['share URL has no UUID', !shareUrl.includes(INVOICE_ID)],
    ['token resolves to invoice', resolvedId === INVOICE_ID],
    ['document loads', Boolean(document)],
    ['WhatsApp URL matches share URL', whatsAppUrl === shareUrl],
    ['admin URL uses /admin/invoices/', adminUrl.includes(`/admin/invoices/${INVOICE_ID}`)],
    ['legacy /resident/invoices/ not in share URL', !shareUrl.includes('/resident/invoices/')],
  ] as const;

  console.log(`Invoice number: ${row.invoiceNumber}`);
  console.log(`Status: ${row.status}`);
  console.log(`Share token: ${shareToken}`);
  console.log(`\nShare URL: ${shareUrl}`);
  console.log(`Admin URL: ${adminUrl}`);
  console.log('\nChecks:');
  let pass = 0;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${label}`);
    if (ok) pass++;
  }

  console.log(`\nOVERALL: ${pass === checks.length ? 'PASS' : 'FAIL'} (${pass}/${checks.length})`);
  await closeDb();
  if (pass !== checks.length) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
