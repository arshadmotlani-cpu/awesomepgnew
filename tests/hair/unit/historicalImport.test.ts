import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeImportRowKey,
  distributePaise,
  mapHeaderToField,
  parseExcelDate,
  parsePaymentMethod,
  priceHistoricalInvoice,
  validateHistoricalRow,
  type HistoricalSalesRow,
} from '../../../src/hair/domain/import/historicalInvoice';

describe('historicalImport domain', () => {
  it('maps Final Bills column headers', () => {
    assert.equal(mapHeaderToField('Client Name'), 'customer_name');
    assert.equal(mapHeaderToField('Mobile No'), 'customer_phone');
    assert.equal(mapHeaderToField('Amount (₹)'), 'amount_inr');
    assert.equal(mapHeaderToField('Type'), 'payment_method');
    assert.equal(mapHeaderToField('Service'), 'description');
  });

  it('parses DD-Mon-YY dates', () => {
    const d = parseExcelDate('01-Apr-26');
    assert.ok(d);
    assert.equal(d!.toISOString().slice(0, 10), '2026-04-01');
  });

  it('parses Cash and UPI payment types', () => {
    assert.equal(parsePaymentMethod('Cash'), 'cash');
    assert.equal(parsePaymentMethod('UPI'), 'upi');
  });

  it('distributes paise without loss', () => {
    const parts = distributePaise(1001, 3);
    assert.equal(parts.reduce((a, b) => a + b, 0), 1001);
  });

  it('prices multi-line invoice to total', () => {
    const row: HistoricalSalesRow = {
      rowNumber: 2,
      transactionDate: new Date('2026-04-01T12:00:00.000Z'),
      customerName: 'Test',
      description: 'Hair, Nails',
      lineItems: [
        { description: 'RC Haircut', kind: 'service' },
        { description: 'Manicure', kind: 'custom' },
      ],
      amountPaise: 100000,
      discountPaise: 0,
      paymentMethod: 'cash',
      gstBps: 1800,
      quantity: 1,
    };
    const priced = priceHistoricalInvoice(row);
    assert.equal(priced.grandTotalPaise, 100000);
    assert.equal(priced.lines.length, 2);
  });

  it('builds stable row keys', () => {
    const base = {
      transactionDate: new Date('2026-04-01T12:00:00.000Z'),
      customerName: 'A',
      customerPhone: '9999999999',
      description: 'Hair',
      lineItems: [],
      amountPaise: 50000,
      discountPaise: 0,
      paymentMethod: 'upi' as const,
      gstBps: 1800,
      quantity: 1,
    };
    const k1 = computeImportRowKey(base);
    const k2 = computeImportRowKey({ ...base, sheetName: 'April' });
    assert.notEqual(k1, k2);
  });

  it('rejects invalid rows', () => {
    const row: HistoricalSalesRow = {
      rowNumber: 1,
      transactionDate: new Date(),
      customerName: '',
      description: 'Hair',
      lineItems: [],
      amountPaise: 0,
      discountPaise: 0,
      paymentMethod: 'cash',
      gstBps: 1800,
      quantity: 1,
    };
    assert.ok(validateHistoricalRow(row));
  });
});

