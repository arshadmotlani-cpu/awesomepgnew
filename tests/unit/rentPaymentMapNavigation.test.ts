import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

test('invoices module has no Rent Payment Map tab', () => {
  assert.throws(() => read('src/components/admin/invoices/InvoicesSubNav.tsx'));
  const invoicesPage = read('app/(admin)/admin/invoices/page.tsx');
  assert.doesNotMatch(invoicesPage, /Rent Payment Map/);
  assert.doesNotMatch(invoicesPage, /rent-payment-map/);
});

test('legacy invoices rent-payment-map URL redirects to operations', () => {
  const legacy = read('app/(admin)/admin/invoices/rent-payment-map/page.tsx');
  assert.match(legacy, /redirect\(/);
  assert.match(legacy, /RENT_PAYMENT_MAP_HREF\.operations/);
  assert.doesNotMatch(legacy, /RentPaymentMapPageContent/);
});

test('operations and billing expose Rent Payment Map via shared page content', () => {
  const operations = read('app/(admin)/admin/operations/rent-payment-map/page.tsx');
  const billing = read('app/(admin)/admin/billing/rent-payment-map/page.tsx');
  const shared = read('src/components/admin/rentPaymentMap/RentPaymentMapPageContent.tsx');

  assert.match(operations, /RentPaymentMapPageContent/);
  assert.match(billing, /RentPaymentMapPageContent/);
  assert.doesNotMatch(operations, /loadRentPaymentMap/);
  assert.doesNotMatch(billing, /loadRentPaymentMap/);
  assert.match(shared, /loadRentPaymentMap/);
  assert.match(shared, /RentPaymentMapPanel/);
});

test('operations and billing sub-nav labels are Rent Payment Map', () => {
  const opsNav = read('src/components/admin/operations/OperationsSectionSubNav.tsx');
  const billingNav = read('src/components/admin/billing/BillingSectionSubNav.tsx');
  assert.match(opsNav, /label: 'Rent Payment Map'/);
  assert.match(billingNav, /label: 'Rent Payment Map'/);
  assert.match(opsNav, /RENT_PAYMENT_MAP_HREF\.operations/);
  assert.match(billingNav, /RENT_PAYMENT_MAP_HREF\.billing/);
});

test('route SSOT defines operations and billing entry points', () => {
  const routes = read('src/lib/admin/rentPaymentMapRoutes.ts');
  assert.match(routes, /operations: '\/admin\/operations\/rent-payment-map'/);
  assert.match(routes, /billing: '\/admin\/billing\/rent-payment-map'/);
});
