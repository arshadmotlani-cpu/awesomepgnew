import assert from 'node:assert/strict';
import test from 'node:test';
import { isFinancialInvoiceCancellable } from '../../src/lib/billing/invoiceStateMachine';
import { buildInvoiceWhatsAppSendPayload } from '../../src/lib/billing/sendInvoiceOnWhatsApp';

test('paid invoices use void flow not plain cancel UI gate', () => {
  assert.equal(isFinancialInvoiceCancellable('paid'), false);
  assert.equal(isFinancialInvoiceCancellable('sent'), true);
});

test('refunded and cancelled invoices are not cancellable', () => {
  assert.equal(isFinancialInvoiceCancellable('refunded'), false);
  assert.equal(isFinancialInvoiceCancellable('cancelled'), false);
});

test('WhatsApp payload includes public invoice URL', () => {
  const payload = buildInvoiceWhatsAppSendPayload(
    {
      id: 'inv-1',
      invoiceNumber: 'INV-2026-SHA-0001',
      invoiceType: 'rent',
      customerName: 'Test Resident',
      customerPhone: '+919876543210',
      pgName: 'Awesome PG',
      billingMonth: '2026-07-01',
      totals: {
        subtotalPaise: 500000,
        lateFeePaise: 0,
        discountPaise: 0,
        totalPaise: 500000,
        paidPaise: 0,
        balanceDuePaise: 500000,
      },
    },
    'https://www.awesomepg.in/i/abc123sharetoken',
  );
  assert.match(payload.message, /July Rent invoice/);
  assert.match(payload.message, /https:\/\/www\.awesomepg\.in\/i\/abc123sharetoken/);
  assert.ok(payload.whatsappUrl?.includes('wa.me'));
});
