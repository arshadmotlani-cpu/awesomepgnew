import assert from 'node:assert/strict';
import test from 'node:test';
import {
  billingMonthLabel,
  buildElectricityCollectionWhatsAppMessage,
  buildRentCollectionWhatsAppMessage,
  buildCollectionWhatsAppUrl,
} from '../../src/lib/billing/invoiceCollectionWhatsApp';

test('billingMonthLabel formats July from ISO date', () => {
  assert.equal(billingMonthLabel('2026-07-01'), 'July');
  assert.equal(billingMonthLabel('2026-06-01'), 'June');
});

test('rent collection WhatsApp message uses public invoice URL', () => {
  const message = buildRentCollectionWhatsAppMessage({
    customerName: 'CV Laxminarayana',
    pgName: 'Awesome PG',
    billingMonth: '2026-07-01',
    amountPaise: 721140,
    publicInvoiceUrl: 'https://www.awesomepg.in/i/abc123sharetoken',
  });
  assert.match(message, /July Rent invoice for Awesome PG/);
  assert.match(message, /₹7,211/);
  assert.match(message, /https:\/\/www\.awesomepg\.in\/i\/abc123sharetoken/);
  assert.match(message, /upload the payment screenshot/);
  assert.doesNotMatch(message, /Pay here/);
});

test('electricity collection WhatsApp message is separate from rent', () => {
  const message = buildElectricityCollectionWhatsAppMessage({
    customerName: 'Krishna',
    billingMonth: '2026-06-01',
    amountPaise: 82700,
    publicInvoiceUrl: 'https://www.awesomepg.in/i/elecsharetoken',
  });
  assert.match(message, /June Electricity bill/);
  assert.match(message, /₹827/);
  assert.match(message, /https:\/\/www\.awesomepg\.in\/i\/elecsharetoken/);
});

test('buildCollectionWhatsAppUrl uses wa.me with encoded text', () => {
  const url = buildCollectionWhatsAppUrl({
    customerPhone: '+919876543210',
    message: 'Hi Test,\n\nYour July Rent invoice',
  });
  assert.ok(url?.startsWith('https://wa.me/919876543210?text='));
});
