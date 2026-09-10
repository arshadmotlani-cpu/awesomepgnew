import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFinancialInvoiceIdForOutstandingLine } from '@/src/lib/operations/operationsQueueFinancialLinks';

test('WhatsApp resolution prefers explicit financialInvoiceId on outstanding line', async () => {
  const result = await resolveFinancialInvoiceIdForOutstandingLine({
    categoryLabel: 'Rent',
    periodLabel: 'Sep 2026',
    amountPaise: 220_000,
    kind: 'rent',
    financialInvoiceId: 'fin-explicit-id',
    bookingId: 'booking-1',
    billingMonth: '2026-09-01',
    sourceId: 'rent-other-id',
    sourceTable: 'rent_invoices',
  });
  assert.equal(result, 'fin-explicit-id');
});

test('UnifiedOpsOutstandingLine carries sourceId for exact invoice targeting', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const queue = readFileSync(
    resolve(process.cwd(), 'src/services/unifiedOperationsQueue.ts'),
    'utf8',
  );
  assert.match(queue, /sourceId: row\.sourceId/);
  assert.match(queue, /sourceTable: row\.sourceTable/);
});

test('operations financial links prefer sourceId before billing-month fallback', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const links = readFileSync(
    resolve(process.cwd(), 'src/lib/operations/operationsQueueFinancialLinks.ts'),
    'utf8',
  );
  assert.match(links, /if \(line\.sourceId && line\.sourceTable\)/);
  assert.match(links, /findCollectibleRentInvoiceId/);
});
