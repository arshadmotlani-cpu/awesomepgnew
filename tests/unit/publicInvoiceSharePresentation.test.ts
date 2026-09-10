import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canShowPublicInvoiceSharePayCta } from '@/src/lib/billing/publicInvoiceSharePay';

test('share pay CTA hidden for paid and processing invoices', () => {
  assert.equal(
    canShowPublicInvoiceSharePayCta({ status: 'paid', balanceDuePaise: 1000 }),
    false,
  );
  assert.equal(
    canShowPublicInvoiceSharePayCta({ status: 'payment_in_progress', balanceDuePaise: 1000 }),
    false,
  );
  assert.equal(
    canShowPublicInvoiceSharePayCta({ status: 'sent', balanceDuePaise: 1000 }),
    true,
  );
  assert.equal(
    canShowPublicInvoiceSharePayCta({ status: 'overdue', balanceDuePaise: 0 }),
    false,
  );
});

test('public share page uses share presentation and Pay this bill label', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'app/i/[shareToken]/page.tsx'),
    'utf8',
  );
  assert.match(page, /presentationMode="share"/);
  assert.match(page, /Pay this bill/);
  assert.match(page, /canShowPublicInvoiceSharePayCta/);
});

test('InvoiceDocument share mode hides deposit and booking payment summary', () => {
  const doc = readFileSync(
    resolve(process.cwd(), 'src/components/billing/InvoiceDocument.tsx'),
    'utf8',
  );
  assert.match(doc, /bookingPaymentSummary && !shareMode/);
  assert.match(doc, /doc\.stayDates && !shareMode/);
});

test('invoice-scoped payment link skips deposit combination on pay page', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'app/(customer)/pay/[linkId]/page.tsx'),
    'utf8',
  );
  assert.match(page, /invoiceScoped/);
  assert.match(page, /!invoiceScoped/);
});
