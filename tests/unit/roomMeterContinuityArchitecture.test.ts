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

  test('last-reading API excludes pipeline-test pollution via shared resolver', () => {
    const src = read('app/api/admin/rooms/[id]/last-electricity-reading/route.ts');
    assert.match(src, /resolveRoomPreviousMeterReading/);
    assert.doesNotMatch(src, /from\(meterLogs\)/);
  });
});
