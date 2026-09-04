import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

test('electricity generate page has one PG-wise checklist UI — no dual forms', () => {
  const page = read('app/(admin)/admin/billing/electricity/generate/page.tsx');
  assert.match(page, /PgElectricityBillingChecklistClient/);
  assert.doesNotMatch(page, /ElectricityWizardLauncher/);
  assert.doesNotMatch(page, /NewElectricityBillForm/);
  assert.doesNotMatch(page, /Start electricity entry/);
  assert.doesNotMatch(page, /wizardMode/);
});

test('PG checklist loads previous reading from meter SSOT automatically', () => {
  const checklist = read('src/lib/billing/pgElectricityBillingChecklist.ts');
  const ui = read('src/components/admin/electricity/PgElectricityBillingChecklist.tsx');
  assert.match(checklist, /resolveOfficialPreviousReading/);
  assert.match(checklist, /source === 'none'/);
  assert.match(checklist, /previous_unavailable/);
  assert.match(checklist, /maintenance_excluded/);
  assert.match(checklist, /activeBedCount === 0/);
  assert.match(ui, /View bill/);
  assert.match(ui, /\/admin\/electricity\/bills\/\$\{room\.billId\}/);
  assert.doesNotMatch(ui, /name="previousReading/);
  assert.match(ui, /Current must be ≥ previous/);
});

test('generation action uses canonical createElectricityBill and is PG-scoped', () => {
  const actions = read('app/(admin)/admin/billing/electricity/generate/actions.ts');
  assert.match(actions, /createElectricityBill/);
  assert.match(actions, /resolveOfficialPreviousReading/);
  assert.match(actions, /pgId/);
  assert.match(actions, /Current reading must be ≥ previous reading/);
  assert.doesNotMatch(actions, /computeLateFee|lateFeePercent/);
});

test('Billing Center electricity card opens PG workflow without requiring global generate', () => {
  const primary = read('src/components/admin/billing/BillingPrimaryActions.tsx');
  assert.match(primary, /Open Electricity Billing/);
  assert.match(primary, /Select a PG to view billing status/);
  assert.doesNotMatch(primary, /Generate Rent Bills/);
  assert.doesNotMatch(primary, /generateRentBillsAction/);
});

test('room meter continuity and electricity late fee contracts unchanged', () => {
  const billing = read('src/services/electricityBilling.ts');
  const continuity = read('tests/unit/roomMeterContinuityArchitecture.test.ts');
  assert.match(billing, /resolveOfficialPreviousReading/);
  assert.match(billing, /createElectricityBill/);
  assert.match(continuity, /resolveOfficialPreviousReading/);
});
