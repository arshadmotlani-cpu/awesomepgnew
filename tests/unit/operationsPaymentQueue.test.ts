import assert from 'node:assert/strict';
import test from 'node:test';
import { electricityRowToQueueItem } from '@/src/lib/billing/collectionsQueue';
import { buildOperationsPaymentWhatsAppMessage } from '@/src/lib/operations/operationsPaymentWhatsApp';

test('electricityRowToQueueItem excludes paid and proof-pending invoices', () => {
  const base = {
    id: 'inv-1',
    invoiceNumber: 'E-1',
    customerId: 'c1',
    customerFullName: 'Test',
    customerPhone: '9999999999',
    pgId: 'pg1',
    pgName: 'PG',
    roomNumber: '101',
    billingMonth: '2026-06-01',
    dueDate: '2026-07-05',
    amountPaise: 50000,
    outstandingPaise: 50000,
    effectiveStatus: 'pending',
    isOverdue: false,
  };

  assert.equal(electricityRowToQueueItem({ ...base, paymentProofUrl: 'https://proof' }, '2026-07-02'), null);
  assert.equal(
    electricityRowToQueueItem({ ...base, effectiveStatus: 'paid', outstandingPaise: 0 }, '2026-07-02'),
    null,
  );
  assert.equal(
    electricityRowToQueueItem({ ...base, effectiveStatus: 'cancelled' }, '2026-07-02'),
    null,
  );

  const item = electricityRowToQueueItem(base, '2026-07-02');
  assert.ok(item);
  assert.equal(item.categoryLabel, 'Electricity');
  assert.equal(item.periodLabel, 'June 2026');
});

test('buildOperationsPaymentWhatsAppMessage uses rent template for single rent line', () => {
  const message = buildOperationsPaymentWhatsAppMessage({
    residentName: 'Harshal Kumar',
    pgName: 'Awesome PG',
    lines: [
      {
        categoryLabel: 'Rent',
        periodLabel: 'July 2026',
        amountPaise: 1200000,
        kind: 'rent',
        billingMonth: '2026-07-01',
        paymentUrl: 'https://example.com/i/token',
      },
    ],
  });

  assert.match(message, /Hi Harshal/);
  assert.match(message, /July/);
  assert.match(message, /https:\/\/example.com\/i\/token/);
  assert.match(message, /After payment upload/);
});
