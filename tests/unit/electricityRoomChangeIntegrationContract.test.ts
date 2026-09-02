import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const tenancySource = readFileSync(
  new URL('../../src/services/roomTransferTenancy.ts', import.meta.url),
  'utf8',
);
const occupantSource = readFileSync(
  new URL('../../src/lib/billing/roomElectricityOccupants.ts', import.meta.url),
  'utf8',
);

test('transfer completion writes matching half-open reservation boundaries', () => {
  assert.match(
    tenancySource,
    /stay_range = daterange\(lower\(stay_range\), \$\{input\.transferDate\}::date, '\[\\?\)'\)/,
  );
  assert.match(
    tenancySource,
    /stayRange: sql`daterange\(\$\{input\.transferDate\}::date, NULL, '\[\)'\)`/,
  );
});

test('electricity reconstructs completed historical primary reservations', () => {
  assert.match(
    occupantSource,
    /inArray\(bedReservations\.status, \['active', 'completed'\]\)/,
  );
  assert.match(
    occupantSource,
    /inArray\(bookings\.status, \['confirmed', 'completed', 'superseded'\]\)/,
  );
  assert.match(occupantSource, /mergeRoomElectricityCoverage\(/);
});

test('room transfer writer does not mutate electricity bills or invoices', () => {
  assert.doesNotMatch(tenancySource, /electricityBills|electricityInvoices|electricity_bills/);
});
