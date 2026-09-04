/**
 * Electricity details loader must never throw into admin/error.tsx for domain failures.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { tryParseDateBound } from '@/src/lib/dates';

test('tryParseDateBound never throws on malformed postgres bounds', () => {
  assert.equal(tryParseDateBound(null), null);
  assert.equal(tryParseDateBound(''), null);
  assert.equal(tryParseDateBound('infinity'), null);
  assert.equal(tryParseDateBound('-infinity'), null);
  assert.equal(tryParseDateBound('not-a-date'), null);
  assert.equal(tryParseDateBound('"2026-08-01"'), '2026-08-01');
  assert.equal(tryParseDateBound('2026-08-01'), '2026-08-01');
  assert.equal(tryParseDateBound('2026-08-01 00:00:00+00'), '2026-08-01');
});

test('electricity audit load result type contract is non-throwing domain result', async () => {
  const source = await import('node:fs').then((fs) =>
    fs.readFileSync('src/services/roomElectricityAuditBundle.ts', 'utf8'),
  );
  assert.match(source, /export async function loadRoomElectricityAuditBundleResult/);
  assert.match(source, /code: 'unexpected_error'/);
  assert.match(source, /missing_breakdown/);
  assert.match(source, /incomplete_generation/);
  assert.match(source, /domainWarnings/);
  assert.match(source, /isProductionElectricityInvoiceFilter/);
  assert.match(source, /loadStoredElectricityBillBreakdown/);
  assert.match(source, /billSummary/);
});

test('details page consumes typed audit result — not raw throw', async () => {
  const source = await import('node:fs').then((fs) =>
    fs.readFileSync('app/(admin)/admin/electricity/bills/[id]/page.tsx', 'utf8'),
  );
  assert.match(source, /loadRoomElectricityAuditBundleResult/);
  assert.match(source, /Electricity bill details unavailable/);
  assert.match(source, /billSummary/);
  assert.match(source, /Back to Electricity Billing/);
  assert.doesNotMatch(source, /loadRoomElectricityAuditBundle\(/);
});
