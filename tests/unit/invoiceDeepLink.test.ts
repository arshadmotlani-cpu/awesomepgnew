import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  isFinancialInvoiceUuid,
} from '../../src/lib/billing/resolveFinancialInvoiceRef';
import {
  buildInvoicePublicUrl,
  residentInvoiceSharePath,
} from '../../src/lib/billing/sendInvoiceOnWhatsApp';
import { invoiceDetailHref } from '../../src/lib/billing/invoiceRoutes';
import { safeNext } from '../../src/lib/auth/safeNext';
import { CANONICAL_PRODUCTION_URL, getAppUrl } from '../../src/lib/url';

test('isFinancialInvoiceUuid accepts canonical uuid', () => {
  assert.equal(
    isFinancialInvoiceUuid('550e8400-e29b-41d4-a716-446655440000'),
    true,
  );
});

test('isFinancialInvoiceUuid rejects invoice numbers', () => {
  assert.equal(isFinancialInvoiceUuid('INV-2026-AMB-0142'), false);
});

test('buildInvoicePublicUrl resident share always uses invoice uuid', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000';
  const url = buildInvoicePublicUrl(id, 'resident', CANONICAL_PRODUCTION_URL);
  assert.equal(url, `${CANONICAL_PRODUCTION_URL}/resident/invoices/${id}`);
});

test('residentInvoiceSharePath is stable permanent path', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000';
  assert.equal(residentInvoiceSharePath(id), `/resident/invoices/${id}`);
});

test('safeNext preserves resident invoice deep link', () => {
  const path = '/resident/invoices/550e8400-e29b-41d4-a716-446655440000';
  assert.equal(safeNext(path), path);
});

test('safeNext preserves legacy account invoice deep link', () => {
  const path = '/account/resident/invoices/550e8400-e29b-41d4-a716-446655440000';
  assert.equal(safeNext(path), path);
});

test('safeNext preserves share alias with invoice number', () => {
  const path = '/resident/invoices/INV-2026-AMB-0142';
  assert.equal(safeNext(path), path);
});

test('invoiceDetailHref resident canonical path unchanged', () => {
  assert.equal(
    invoiceDetailHref('550e8400-e29b-41d4-a716-446655440000', 'resident'),
    '/account/resident/invoices/550e8400-e29b-41d4-a716-446655440000',
  );
});

test('getAppUrl on Vercel production is always canonical www', () => {
  const prevEnv = process.env.VERCEL_ENV;
  const prevVercel = process.env.VERCEL_URL;
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  try {
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_URL = 'project.vazhugal.app';
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.equal(getAppUrl(), CANONICAL_PRODUCTION_URL);
  } finally {
    if (prevEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevEnv;
    if (prevVercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = prevVercel;
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
  }
});
