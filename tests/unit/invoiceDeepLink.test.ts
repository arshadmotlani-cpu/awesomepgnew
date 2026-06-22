import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  isFinancialInvoiceUuid,
} from '../../src/lib/billing/resolveFinancialInvoiceRef';
import { buildInvoicePublicUrl } from '../../src/lib/billing/sendInvoiceOnWhatsApp';
import { invoiceDetailHref } from '../../src/lib/billing/invoiceRoutes';
import { safeNext } from '../../src/lib/auth/safeNext';

test('isFinancialInvoiceUuid accepts canonical uuid', () => {
  assert.equal(
    isFinancialInvoiceUuid('550e8400-e29b-41d4-a716-446655440000'),
    true,
  );
});

test('isFinancialInvoiceUuid rejects invoice numbers', () => {
  assert.equal(isFinancialInvoiceUuid('INV-2026-AMB-0142'), false);
});

test('buildInvoicePublicUrl resident share uses /resident/invoices/ alias with invoice number', () => {
  const url = buildInvoicePublicUrl(
    '550e8400-e29b-41d4-a716-446655440000',
    'resident',
    'https://awesomepg.in',
    'INV-2026-AMB-0142',
  );
  assert.equal(url, 'https://awesomepg.in/resident/invoices/INV-2026-AMB-0142');
});

test('buildInvoicePublicUrl resident share falls back to uuid ref', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000';
  const url = buildInvoicePublicUrl(id, 'resident', 'https://awesomepg.in');
  assert.equal(url, `https://awesomepg.in/resident/invoices/${id}`);
});

test('safeNext preserves resident invoice deep link', () => {
  const path = '/account/resident/invoices/550e8400-e29b-41d4-a716-446655440000';
  assert.equal(safeNext(path), path);
});

test('safeNext preserves share alias deep link', () => {
  const path = '/resident/invoices/INV-2026-AMB-0142';
  assert.equal(safeNext(path), path);
});

test('invoiceDetailHref resident canonical path unchanged', () => {
  assert.equal(
    invoiceDetailHref('550e8400-e29b-41d4-a716-446655440000', 'resident'),
    '/account/resident/invoices/550e8400-e29b-41d4-a716-446655440000',
  );
});
