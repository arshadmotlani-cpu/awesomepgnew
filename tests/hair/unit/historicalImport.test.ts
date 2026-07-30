import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeImportRowKey,
  mapHeaderToField,
  parseExcelDate,
  parseInrToPaise,
  parsePaymentMethod,
  priceHistoricalLine,
  validateHistoricalRow,
} from '../../../src/hair/domain/import/historicalInvoice.ts';

test('mapHeaderToField recognizes template columns', () => {
  assert.equal(mapHeaderToField('Transaction Date'), 'transaction_date');
  assert.equal(mapHeaderToField('amount_inr'), 'amount_inr');
  assert.equal(mapHeaderToField('Payment Method'), 'payment_method');
});

test('parseInrToPaise handles rupee strings', () => {
  assert.equal(parseInrToPaise('1,180.50'), 118050);
  assert.equal(parseInrToPaise(1180), 118000);
});

test('parseExcelDate accepts ISO date', () => {
  const d = parseExcelDate('2024-03-15');
  assert.ok(d);
  assert.equal(d!.toISOString().slice(0, 10), '2024-03-15');
});

test('parsePaymentMethod normalizes values', () => {
  assert.equal(parsePaymentMethod('UPI'), 'upi');
  assert.equal(parsePaymentMethod('Card'), 'card');
  assert.equal(parsePaymentMethod('invalid'), null);
});

test('priceHistoricalLine matches GST-inclusive amount', () => {
  const priced = priceHistoricalLine({
    description: 'Haircut',
    amountPaise: 118000,
    discountPaise: 0,
    gstBps: 1800,
    quantity: 1,
  });
  assert.equal(priced.finalLinePaise, 118000);
  assert.ok(priced.gstPaise > 0);
  assert.ok(priced.basePaise + priced.gstPaise === priced.finalLinePaise);
});

test('computeImportRowKey is stable', () => {
  const base = {
    rowId: undefined as string | undefined,
    transactionDate: new Date('2024-01-15T12:00:00.000Z'),
    customerName: 'Test',
    customerPhone: '9876543210',
    description: 'Service',
    amountPaise: 100000,
    discountPaise: 0,
    paymentMethod: 'cash' as const,
    gstBps: 1800,
    quantity: 1,
    originalInvoiceRef: undefined as string | undefined,
  };
  const a = computeImportRowKey(base);
  const b = computeImportRowKey(base);
  assert.equal(a, b);
});

test('validateHistoricalRow rejects empty customer', () => {
  const row = {
    rowNumber: 2,
    transactionDate: new Date(),
    customerName: '',
    description: 'X',
    amountPaise: 10000,
    discountPaise: 0,
    paymentMethod: 'cash' as const,
    gstBps: 1800,
    quantity: 1,
  };
  assert.equal(validateHistoricalRow(row), 'customer_name is required');
});
