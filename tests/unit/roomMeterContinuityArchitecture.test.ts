/**
 * Architecture guard — continuous room meter SSOT.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('continuous room meter architecture', () => {
  test('legacy refund electricity never creates monthly room bills', () => {
    const src = read('src/services/refundElectricity.ts');
    assert.doesNotMatch(src, /createBillFromMeterLogs/);
    assert.doesNotMatch(src, /createEstimatedMonthlyBill/);
    assert.match(src, /checkout settlement/i);
  });

  test('monthly bill create enforces continuous previous reading', () => {
    const src = read('src/services/electricityBilling.ts');
    assert.match(src, /validateContinuousPreviousReading/);
    assert.match(src, /resolveOfficialPreviousReading/);
    assert.match(src, /advanceBaseline/);
    assert.match(src, /allowPreviousReadingOverride/);
  });

  test('meter-log bill path uses room previous SSOT not checkout logs', () => {
    const src = read('src/services/meterElectricity.ts');
    assert.match(src, /resolveRoomPreviousMeterReading/);
    assert.doesNotMatch(
      src,
      /lt\(meterLogs\.recordedAt, endLog\.recordedAt\)/,
    );
  });

  test('last-reading API scopes baseline to billing month when provided', () => {
    const src = read('app/api/admin/rooms/[id]/last-electricity-reading/route.ts');
    assert.match(src, /resolveRoomPreviousMeterReading/);
    assert.match(src, /beforeBillingMonth/);
    assert.match(src, /billingMonth/);
    assert.doesNotMatch(src, /from\(meterLogs\)/);
  });

  test('previous reading resolver filters by billing month before latest bill lookup', () => {
    const src = read('src/services/roomMeterReadingSsot.ts');
    assert.match(src, /beforeBillingMonth/);
    assert.match(src, /lt\(electricityBills\.billingMonth/);
  });

  test('createElectricityBill validates continuity against month-scoped baseline', () => {
    const src = read('src/services/electricityBilling.ts');
    assert.match(src, /resolveOfficialPreviousReading\(input\.roomId, billingMonth\)/);
  });

  test('resolveRoomPreviousMeterReading requires beforeBillingMonth in signature', () => {
    const src = read('src/services/roomMeterReadingSsot.ts');
    assert.match(src, /options: \{ beforeBillingMonth: string \}/);
    assert.doesNotMatch(src, /beforeBillingMonth\?:/);
  });

  test('resolveOfficialPreviousReading requires beforeBillingMonth in signature', () => {
    const src = read('src/services/meterTimelineService.ts');
    assert.match(src, /resolveOfficialPreviousReading\(\s*roomId: string,\s*beforeBillingMonth: string/);
    assert.doesNotMatch(src, /beforeBillingMonth\?:/);
  });

  test('pickPreviousMeterReadingFromFinalizedBills requires beforeBillingMonth', () => {
    const src = read('src/lib/billing/roomMeterReadingSsot.ts');
    assert.match(src, /beforeBillingMonth: string/);
    assert.doesNotMatch(src, /beforeBillingMonth\?:/);
  });

  test('last-reading API always resolves with a billing month', () => {
    const src = read('app/api/admin/rooms/[id]/last-electricity-reading/route.ts');
    assert.match(src, /resolveBillingMonth/);
    assert.match(
      src,
      /resolveRoomPreviousMeterReading\(roomId, \{ beforeBillingMonth \}\)/,
    );
  });

  test('billing diagnostics passes billing month to baseline resolver', () => {
    const src = read('src/components/admin/billing/BillingDiagnosticsPanel.tsx');
    assert.match(src, /resolveOfficialPreviousReading\(room\.roomId, billingMonth\)/);
  });

  test('generate bill form always sends billingMonth query param', () => {
    const src = read('src/components/admin/NewElectricityBillForm.tsx');
    assert.match(src, /params\.set\('billingMonth', effectiveBillingMonth\)/);
  });

  test('checkout settlement electricity prefetch sends billingMonth', () => {
    const src = read('src/components/admin/CheckoutSettlementElectricitySection.tsx');
    assert.match(src, /last-electricity-reading\?billingMonth=/);
    assert.match(src, /detail\.vacatingDate/);
  });
});
