import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

test('rentPaymentMap service batches invoice and rejection loads', () => {
  const src = read('src/services/rentPaymentMap.ts');
  assert.match(src, /loadRentInvoicesForBookings/);
  assert.match(src, /loadActiveRejectionsForInvoices/);
  assert.match(src, /inArray\(rentInvoices\.bookingId, bookingIds\)/);
  assert.match(src, /inArray\(paymentProofRejections\.entityId, invoiceIds\)/);
  assert.doesNotMatch(src, /for\s*\([^)]*\)\s*\{[^}]*await\s+db/);
});

test('rentPaymentMap service uses month-overlap occupancy not today-only SSOT', () => {
  const src = read('src/services/rentPaymentMap.ts');
  assert.match(src, /stay_range && daterange/);
  assert.doesNotMatch(src, /fetchBedOccupancyRows/);
  assert.doesNotMatch(src, /occupancyReservationCoreSql/);
});

test('main invoices page does not import rent payment map modules', () => {
  const mainPage = read('app/(admin)/admin/invoices/page.tsx');
  assert.doesNotMatch(mainPage, /rentPaymentMap/);
  assert.doesNotMatch(mainPage, /RentPaymentMap/);
});

test('invoice command center is not used by rent payment map service', () => {
  const service = read('src/services/rentPaymentMap.ts');
  assert.doesNotMatch(service, /invoiceCommandCenter/);
  assert.doesNotMatch(service, /InvoiceDayList/);
});

test('rent payment map classifies via projectInvoice SSOT', () => {
  const service = read('src/services/rentPaymentMap.ts');
  assert.match(service, /projectInvoice/);
  assert.match(service, /classifyRentPaymentMapBed/);
});
