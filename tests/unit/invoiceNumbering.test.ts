import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  buildFinancialInvoiceNumber,
  derivePropertyCode,
  formatInvoiceSequence,
  invoiceNumberPrefix,
} from '../../src/lib/billing/invoiceNumbering';

test('derivePropertyCode uses slug first segment uppercased to 3 chars', () => {
  assert.equal(derivePropertyCode('shalimar-heights', 'Shalimar Heights'), 'SHA');
  assert.equal(derivePropertyCode('ab', 'Alpha Beta PG'), 'ALP');
  assert.equal(derivePropertyCode('', ''), 'PGX');
});

test('invoice number prefix and sequence format', () => {
  assert.equal(invoiceNumberPrefix(2026, 'SHA'), 'INV-2026-SHA-');
  assert.equal(formatInvoiceSequence(1), '0001');
  assert.equal(formatInvoiceSequence(142), '0142');
  assert.equal(buildFinancialInvoiceNumber(2026, 'SHA', 142), 'INV-2026-SHA-0142');
});

test('sequence uses minimum of 1 when formatting', () => {
  assert.equal(formatInvoiceSequence(0), '0001');
});
