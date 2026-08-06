import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectionQueueItemOpenHref,
  electricityRowToQueueItem,
} from '@/src/lib/billing/collectionsQueue';
import { buildOperationsPaymentWhatsAppMessage } from '@/src/lib/operations/operationsPaymentWhatsApp';

test('collectionQueueItemOpenHref prefers financial invoice deep link', () => {
  const withInvoice = {
    id: 'elec-inv-1',
    kind: 'electricity' as const,
    customerId: 'cust-1',
    customerFullName: 'Syed Ahmed',
    customerPhone: '9999999999',
    pgId: 'pg1',
    pgName: 'PG',
    roomNumber: '101',
    sourceTable: 'electricity_invoices' as const,
    sourceId: 'src-1',
    financialInvoiceId: 'fin-abc',
    invoiceNumber: 'E-1',
    amountPaise: 50000,
    dueDate: '2026-07-05',
    daysOverdue: 0,
    priority: 'pending' as const,
    effectiveStatus: 'pending',
    invoiceLabel: 'Electricity · 2026-06',
    billingMonth: '2026-06-01',
    categoryLabel: 'Electricity',
    periodLabel: 'June 2026',
  };

  assert.equal(collectionQueueItemOpenHref(withInvoice), '/admin/invoices/fin-abc');

  const withoutInvoice = { ...withInvoice, financialInvoiceId: null };
  assert.equal(
    collectionQueueItemOpenHref(withoutInvoice),
    '/admin/residents/cust-1#open-bills',
  );
});

test('electricityRowToQueueItem excludes paid and proof-pending invoices', () => {
  const base = {
    id: 'inv-1',
    invoiceNumber: 'E-1',
    customerId: 'c1',
    bookingId: 'booking-1',
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
    electricityRowToQueueItem({ ...base, effectiveStatus: 'payment_in_progress' }, '2026-07-02'),
    null,
  );
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
