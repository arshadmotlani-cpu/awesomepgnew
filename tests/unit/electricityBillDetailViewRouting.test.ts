/**
 * View-bill routing + electricity bill detail reliability contracts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

test('View bill link points to canonical detail route with bill id + back context', () => {
  const ui = read('src/components/admin/electricity/PgElectricityBillingChecklist.tsx');
  assert.match(ui, /href=\{`\/admin\/electricity\/bills\/\$\{room\.billId\}/);
  assert.match(ui, /View bill →/);
  assert.match(ui, /month=\$\{encodeURIComponent\(billingMonth\.slice\(0, 7\)\)\}/);
  assert.match(ui, /pgId=\$\{encodeURIComponent\(selectedPgId/);
  assert.doesNotMatch(ui, /View bill →[\s\S]{0,80}generate/);
});

test('canonical bill detail route is /admin/electricity/bills/[id] and does not redirect to generate', () => {
  const page = read('app/(admin)/admin/electricity/bills/[id]/page.tsx');
  assert.match(page, /loadRoomElectricityAuditBundleResult\(id\)/);
  assert.match(page, /Back to Electricity Billing/);
  assert.match(page, /\/admin\/billing\/electricity\/generate\?month=/);
  assert.doesNotMatch(page, /redirect\([^)]*generate/);
  assert.doesNotMatch(page, /permanentRedirect/);
  assert.match(page, /requireAdminPermission\('electricity:write'\)/);
});

test('detail page shows stored meter, allocation, due date, and ₹0 late fee without recalc', () => {
  const page = read('app/(admin)/admin/electricity/bills/[id]/page.tsx');
  assert.match(page, /Electricity bill/);
  assert.match(page, /Previous reading/);
  assert.match(page, /Current reading/);
  assert.match(page, /Units consumed/);
  assert.match(page, /Rate/);
  assert.match(page, /Electricity charge/);
  assert.match(page, /Room total/);
  assert.match(page, /Resident allocation/);
  assert.match(page, /Due date/);
  assert.match(page, /Late fee/);
  assert.match(page, /paiseToInr\(0\)/);
  assert.match(page, /billSummary\.(previousReadingUnits|currentReadingUnits|unitsConsumed|ratePerUnitPaise|totalPaise)/);
  assert.doesNotMatch(page, /createElectricityBill|computeElectricity|recalculate/);
});

test('legacy missing breakdown is informational — not a full-page unexpected_error', () => {
  const page = read('app/(admin)/admin/electricity/bills/[id]/page.tsx');
  const bundle = read('src/services/roomElectricityAuditBundle.ts');
  assert.match(page, /Detailed calculation breakdown was not stored for this historical bill/);
  assert.match(bundle, /loadStoredElectricityBillBreakdown/);
  assert.match(bundle, /missing_breakdown/);
  assert.match(bundle, /isProductionElectricityInvoiceFilter/);
  assert.doesNotMatch(
    bundle,
    /from\(electricityInvoices\)[\s\S]{0,400}isProductionElectricityBillFilter\(\)/,
  );
});

test('getElectricityBillDetail loads by id — not the full bill list', () => {
  const admin = read('src/db/queries/admin.ts');
  const detailFn = admin.slice(admin.indexOf('export function getElectricityBillDetail'));
  const body = detailFn.slice(0, detailFn.indexOf('export type AdminVacatingRow'));
  assert.match(body, /eq\(electricityBills\.id, billId\)/);
  assert.doesNotMatch(body, /listAdminElectricityBills\(\)/);
});

test('stored breakdown loader never rebuilds from live occupancy', () => {
  const source = read('src/lib/billing/buildElectricityBillBreakdown.ts');
  assert.match(source, /export async function loadStoredElectricityBillBreakdown/);
  const stored = source.slice(source.indexOf('export async function loadStoredElectricityBillBreakdown'));
  const storedBody = stored.slice(0, stored.indexOf('export async function loadElectricityBillBreakdown'));
  assert.match(storedBody, /calculationBreakdown/);
  assert.doesNotMatch(storedBody, /loadRoomElectricityTimelineForMonth|buildElectricityBillBreakdownFromContext/);
});

test('bill summary exposes lateFeePaise as 0 for current policy', () => {
  const bundle = read('src/services/roomElectricityAuditBundle.ts');
  assert.match(bundle, /lateFeePaise: 0/);
  assert.match(bundle, /RoomElectricityBillSummary/);
  assert.match(bundle, /paymentStatus: 'Paid' \| 'Pending' \| 'Partially paid'/);
});
