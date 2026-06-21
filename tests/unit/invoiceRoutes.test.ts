import { strict as assert } from 'node:assert';
import test from 'node:test';
import { invoiceDetailHref } from '../../src/lib/billing/invoiceRoutes';

test('invoiceDetailHref admin path', () => {
  assert.equal(
    invoiceDetailHref('abc-123', 'admin'),
    '/admin/invoices/abc-123',
  );
});

test('invoiceDetailHref resident path', () => {
  assert.equal(
    invoiceDetailHref('abc-123', 'resident'),
    '/account/resident/invoices/abc-123',
  );
});
