import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdhocRentPeriodDescription,
  diffInclusiveDays,
  formatAdhocRentNotes,
} from '@/src/lib/billing/adhocRentInvoiceNotes';

test('Ahmed 10-day period 31 Aug – 9 Sep is 10 inclusive days', () => {
  assert.equal(diffInclusiveDays('2026-08-31', '2026-09-09'), 10);
});

test('Ahmed adhoc rent notes use ₹220/day × 10 days and billing period', () => {
  const { description, notes } = formatAdhocRentNotes({
    title: 'Daily rent',
    periodStart: '2026-08-31',
    periodEnd: '2026-09-09',
    amountPaise: 220_000,
  });
  assert.match(description, /220\/day × 10 days/);
  assert.match(description, /2026-08-31 → 2026-09-09/);
  assert.match(notes, /Daily rent —/);
  assert.match(notes, /31 Aug 2026 → 9 Sep 2026/);
  const periodDesc = buildAdhocRentPeriodDescription({
    periodStart: '2026-08-31',
    periodEnd: '2026-09-09',
    amountPaise: 220_000,
  });
  assert.equal(description, `${periodDesc}. Billing period: 31 Aug 2026 → 9 Sep 2026`);
});

test('createAdhocRentInvoice accepts optional billingMonth', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const src = readFileSync(
    resolve(process.cwd(), 'src/services/rentInvoices.ts'),
    'utf8',
  );
  assert.match(src, /billingMonth\?: string/);
  assert.match(src, /input\.billingMonth/);
});

test('createPaymentLinkForInvoice sets rentInvoiceId for rent source invoices', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const src = readFileSync(
    resolve(process.cwd(), 'src/services/unifiedInvoices.ts'),
    'utf8',
  );
  assert.match(src, /detail\.sourceTable === 'rent_invoices'/);
  assert.match(src, /rentInvoiceId/);
});
