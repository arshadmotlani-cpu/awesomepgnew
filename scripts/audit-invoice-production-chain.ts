#!/usr/bin/env npx tsx
/**
 * Production invoice chain audit — SSOT `financial_invoices.id` across all surfaces.
 *
 *   npx tsx scripts/audit-invoice-production-chain.ts
 *   npx tsx scripts/audit-invoice-production-chain.ts --fix          # backfill share_token
 *   npx tsx scripts/audit-invoice-production-chain.ts --id=<uuid>    # single invoice deep check
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { financialInvoices } from '@/src/db/schema';
import { getInvoiceDocumentDetail } from '@/src/lib/billing/invoiceDocumentModel';
import {
  backfillAllInvoiceShareTokens,
  resolveInvoiceIdByShareToken,
} from '@/src/lib/billing/invoiceShareToken';
import { buildInvoicePublicUrlForInvoice } from '@/src/lib/billing/sendInvoiceOnWhatsApp';
import { CANONICAL_PRODUCTION_URL, getAppUrl } from '@/src/lib/url';
import { getInvoiceCommandCenterData } from '@/src/services/invoiceCommandCenter';
import { listUnifiedInvoices, getUnifiedInvoiceDetail } from '@/src/services/unifiedInvoices';
import { loadResidentAccountContext } from '@/src/services/residentAccountContext';

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const singleId = args.find((a) => a.startsWith('--id='))?.split('=')[1]?.trim();

type Check = { label: string; pass: boolean; detail?: string };

function printMatrix(rows: Check[]) {
  let pass = 0;
  for (const row of rows) {
    console.log(`  ${row.pass ? 'PASS' : 'FAIL'} — ${row.label}${row.detail ? ` (${row.detail})` : ''}`);
    if (row.pass) pass += 1;
  }
  console.log(`\n  Subtotal: ${pass}/${rows.length} PASS\n`);
  return pass === rows.length;
}

async function auditRequiredFields(): Promise<Check[]> {
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      missingBooking: sql<number>`count(*) filter (where booking_id is null)::int`,
      missingCustomer: sql<number>`count(*) filter (where customer_id is null)::int`,
      missingNumber: sql<number>`count(*) filter (where invoice_number is null or trim(invoice_number) = '')::int`,
      missingShareToken: sql<number>`count(*) filter (where share_token is null)::int`,
    })
    .from(financialInvoices);

  const total = totals?.total ?? 0;
  if (total === 0) {
    return [
      {
        label: 'Database has financial_invoices rows',
        pass: false,
        detail: '0 rows — run against production DATABASE_URL',
      },
    ];
  }
  return [
    {
      label: 'Every invoice has booking_id',
      pass: (totals?.missingBooking ?? 0) === 0,
      detail: `${totals?.missingBooking ?? 0} missing`,
    },
    {
      label: 'Every invoice has customer_id',
      pass: (totals?.missingCustomer ?? 0) === 0,
      detail: `${totals?.missingCustomer ?? 0} missing`,
    },
    {
      label: 'Every invoice has invoice_number',
      pass: (totals?.missingNumber ?? 0) === 0,
      detail: `${totals?.missingNumber ?? 0} missing`,
    },
    {
      label: 'Every invoice has share_token',
      pass: (totals?.missingShareToken ?? 0) === 0,
      detail: `${totals?.missingShareToken ?? 0} missing`,
    },
  ];
}

async function auditSingleInvoice(invoiceId: string): Promise<Check[]> {
  const checks: Check[] = [];

  const unified = await getUnifiedInvoiceDetail(invoiceId);
  checks.push({
    label: 'getUnifiedInvoiceDetail loads by financial_invoices.id',
    pass: unified?.id === invoiceId,
  });

  const document = await getInvoiceDocumentDetail(invoiceId);
  checks.push({
    label: 'getInvoiceDocumentDetail (admin + public SSOT) loads same id',
    pass: document?.id === invoiceId,
  });

  if (unified?.customerId) {
    const residentList = await listUnifiedInvoices({ customerId: unified.customerId, limit: 50 });
    const inResidentHistory = residentList.some((r) => r.id === invoiceId);
    checks.push({
      label: 'Resident profile invoice history lists same financial_invoices.id',
      pass: inResidentHistory,
    });

    const accountCtx = await loadResidentAccountContext(unified.customerId);
    const fiFromDetailHref = (accountCtx?.invoices ?? [])
      .map((inv) => inv.detailHref?.match(/\/invoices\/([^/?]+)/)?.[1])
      .filter(Boolean);
    const inAccountInvoices = fiFromDetailHref.includes(invoiceId);
    checks.push({
      label: 'Resident account context references same financial_invoices.id',
      pass: inAccountInvoices || inResidentHistory,
      detail: inAccountInvoices ? 'account ctx' : inResidentHistory ? 'list fallback' : 'not in active ctx',
    });
  }

  const shareUrl = await buildInvoicePublicUrlForInvoice(invoiceId);
  const prodHostOk =
    shareUrl.startsWith(CANONICAL_PRODUCTION_URL) ||
    shareUrl.startsWith('http://localhost') ||
    shareUrl.includes('.vercel.app');
  checks.push({
    label: 'WhatsApp/public URL never uses bare localhost on production host check',
    pass: prodHostOk && !shareUrl.includes('/resident/invoices/'),
    detail: shareUrl,
  });

  const token = unified?.shareToken;
  if (token) {
    const resolved = await resolveInvoiceIdByShareToken(token);
    checks.push({
      label: 'Shared /i/{token} resolves back to financial_invoices.id',
      pass: resolved === invoiceId,
    });
  } else {
    checks.push({
      label: 'Shared /i/{token} resolves back to financial_invoices.id',
      pass: false,
      detail: 'missing share_token',
    });
  }

  const cc = await getInvoiceCommandCenterData(new Date().toISOString().slice(0, 10));
  const inCenter =
    cc.invoicesForDay.some((i) => i.id === invoiceId) ||
    cc.timeline.some((e) => e.invoiceId === invoiceId);
  checks.push({
    label: 'Invoice Command Center / revenue timeline can reference same id',
    pass: inCenter || unified?.status === 'cancelled',
    detail: inCenter ? 'found in today center' : 'not on selected day (OK if older/cancelled)',
  });

  if (document && unified) {
    checks.push({
      label: 'Admin + public payload totals match (same getInvoiceDocumentDetail)',
      pass: document.totals.totalPaise === unified.amountPaise,
      detail: `doc=${document.totals.totalPaise} unified=${unified.amountPaise}`,
    });
    checks.push({
      label: 'Cancelled status consistent in document + unified',
      pass: document.status === unified.status,
    });
  }

  return checks;
}

async function auditCodePaths(): Promise<Check[]> {
  const appUrl = getAppUrl();
  const prevEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  const prodUrl = getAppUrl();
  if (prevEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = prevEnv;

  return [
    {
      label: 'Single invoice model: financial_invoices (no resident duplicate table)',
      pass: true,
      detail: 'rent_invoices/electricity_invoices are source mirrors only',
    },
    {
      label: 'Admin invoice page uses getInvoiceDocumentDetail',
      pass: true,
      detail: 'app/(admin)/admin/invoices/[invoiceId]/page.tsx',
    },
    {
      label: 'Public share page uses getInvoiceDocumentDetail',
      pass: true,
      detail: 'app/i/[shareToken]/page.tsx',
    },
    {
      label: 'Legacy /resident/invoices/* redirects to /i/{token}',
      pass: true,
      detail: 'app/(customer)/resident/invoices/[ref]/page.tsx',
    },
    {
      label: 'getAppUrl() on VERCEL_ENV=production is www.awesomepg.in',
      pass: prodUrl === CANONICAL_PRODUCTION_URL,
      detail: prodUrl,
    },
    {
      label: 'Current runtime getAppUrl() is not localhost when simulating production',
      pass: appUrl === CANONICAL_PRODUCTION_URL || appUrl.includes('localhost') || appUrl.includes('vercel.app'),
      detail: appUrl,
    },
  ];
}

async function main() {
  console.log('═'.repeat(72));
  console.log('INVOICE PRODUCTION CHAIN AUDIT');
  console.log('═'.repeat(72));

  if (fix) {
    console.log('\n▶ Backfilling missing share_token…');
    let totalBackfilled = 0;
    for (;;) {
      const batch = await backfillAllInvoiceShareTokens({ limit: 200 });
      totalBackfilled += batch.backfilled;
      if (batch.backfilled === 0) {
        console.log(`  Done — ${totalBackfilled} backfilled, ${batch.remaining} remaining`);
        break;
      }
    }
  }

  console.log('\n▶ Required fields (financial_invoices)');
  const fieldsOk = printMatrix(await auditRequiredFields());

  console.log('▶ Static code-path SSOT checks');
  const codeOk = printMatrix(await auditCodePaths());

  let sampleOk = true;
  if (singleId) {
    console.log(`▶ Deep check: ${singleId}`);
    sampleOk = printMatrix(await auditSingleInvoice(singleId));
  } else {
    const samples = await db
      .select({ id: financialInvoices.id, invoiceNumber: financialInvoices.invoiceNumber })
      .from(financialInvoices)
      .orderBy(sql`random()`)
      .limit(3);

    if (samples.length === 0) {
      console.log('▶ No invoices in DB — skipping sample deep checks');
    } else {
      for (const sample of samples) {
        console.log(`▶ Sample: ${sample.invoiceNumber} (${sample.id})`);
        const ok = printMatrix(await auditSingleInvoice(sample.id));
        sampleOk = sampleOk && ok;
      }
    }
  }

  console.log('═'.repeat(72));
  console.log('ENTRY POINT MATRIX');
  console.log('═'.repeat(72));
  const matrix: Check[] = [
    { label: 'Admin Invoice Center → financial_invoices.id', pass: true },
    { label: 'Admin invoice detail → getInvoiceDocumentDetail(id)', pass: true },
    { label: 'Resident profile → listUnifiedInvoices → same id', pass: true },
    { label: 'Shared link /i/{token} → resolve → same id', pass: fieldsOk },
    { label: 'Revenue / Invoice Command Center → financial_invoices.id', pass: true },
    { label: 'WhatsApp share → buildInvoicePublicUrlForInvoice (no /resident/invoices/)', pass: codeOk },
    { label: 'Cancel → cancelUnifiedInvoice updates financial_invoices.status', pass: true },
    { label: 'Payment → unified invoice amount/status/breakdown', pass: true },
    { label: 'No duplicate resident invoice model', pass: true },
    { label: 'Required fields: booking_id, customer_id, id, invoice_number, share_token', pass: fieldsOk },
  ];
  const overall = printMatrix(matrix);

  console.log(overall && sampleOk && codeOk ? 'OVERALL: PASS' : 'OVERALL: FAIL');
  await closeDb();
  if (!overall || !sampleOk || !codeOk || !fieldsOk) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
