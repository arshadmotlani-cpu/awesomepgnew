import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  isFinancialInvoiceUuid,
} from '../../src/lib/billing/resolveFinancialInvoiceRef';
import {
  buildInvoicePublicSharePath,
  buildInvoicePublicUrl,
  legacyResidentInvoiceSharePath,
} from '../../src/lib/billing/sendInvoiceOnWhatsApp';
import { invoicePublicSharePath } from '../../src/lib/billing/invoiceShareToken';
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

test('buildInvoicePublicUrl uses /i/{shareToken} only', () => {
  const token = 'abc123sharetoken';
  const url = buildInvoicePublicUrl(token, CANONICAL_PRODUCTION_URL);
  assert.equal(url, `${CANONICAL_PRODUCTION_URL}/i/${token}`);
});

test('invoicePublicSharePath never exposes invoice uuid', () => {
  const token = 'abc123sharetoken';
  assert.equal(invoicePublicSharePath(token), `/i/${token}`);
  assert.equal(buildInvoicePublicSharePath(token), `/i/${token}`);
});

test('legacy resident path kept for redirects only', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000';
  assert.equal(legacyResidentInvoiceSharePath(id), `/resident/invoices/${id}`);
});

test('safeNext preserves public invoice share path', () => {
  const path = '/i/abc123sharetoken';
  assert.equal(safeNext(path), path);
});

test('safeNext preserves legacy resident invoice redirect alias', () => {
  const path = '/resident/invoices/550e8400-e29b-41d4-a716-446655440000';
  assert.equal(safeNext(path), path);
});

test('safeNext preserves account invoice path', () => {
  const path = '/account/resident/invoices/550e8400-e29b-41d4-a716-446655440000';
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
