/**
 * Meter-period electricity identity — regression matrix (no Room 102 hardcoding).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  assessMeterPeriodChainContinuity,
  checkoutGrossUnits,
  expectedOpeningReadingForNewBill,
  pickFinalizedBillForCheckout,
  validateMeterPeriodOpening,
} from '@/src/lib/billing/electricityMeterPeriodSsot';
import { buildRoomElectricityMeterPeriodLedger } from '@/src/lib/billing/roomElectricityMeterPeriodLedger';
import { calendarDaysBetween } from '@/src/lib/billing/roomElectricityOccupancyCoverage';

const room102Chain = [
  {
    billingMonth: '2026-06-01',
    previousReadingUnits: 205,
    currentReadingUnits: 241,
    createdAt: '2026-06-15T10:00:00.000Z',
  },
  {
    billingMonth: '2026-07-01',
    previousReadingUnits: 241,
    currentReadingUnits: 337,
    createdAt: '2026-07-20T10:00:00.000Z',
  },
  {
    billingMonth: '2026-09-01',
    previousReadingUnits: 337,
    currentReadingUnits: 424,
    periodStartDate: '2026-07-21',
    periodEndDate: '2026-09-04',
    createdAt: '2026-09-04T10:00:00.000Z',
  },
];

test('a billing period may cross calendar months (337→424 with Jul–Sep dates)', () => {
  const sep = room102Chain[2]!;
  assert.ok(sep.periodStartDate!.startsWith('2026-07'));
  assert.ok(sep.periodEndDate!.startsWith('2026-09'));
  const days = calendarDaysBetween(sep.periodStartDate!, '2026-09-05');
  assert.ok(days.length > 31);
});

test('two billing periods may share the same reporting month label', () => {
  const a = {
    billingMonth: '2026-09-01',
    previousReadingUnits: 337,
    currentReadingUnits: 424,
    createdAt: '2026-09-04T10:00:00.000Z',
  };
  const b = {
    billingMonth: '2026-09-01',
    previousReadingUnits: 424,
    currentReadingUnits: 479,
    createdAt: '2026-09-25T10:00:00.000Z',
  };
  assert.notEqual(a.previousReadingUnits, b.previousReadingUnits);
  assert.equal(a.billingMonth, b.billingMonth);
  assert.equal(expectedOpeningReadingForNewBill([a]), 424);
  assert.equal(expectedOpeningReadingForNewBill([a, b]), 479);
});

test('new period opens from last finalized closing — not calendar month', () => {
  assert.equal(expectedOpeningReadingForNewBill(room102Chain), 424);
  const opening = validateMeterPeriodOpening({
    priorFinalizedBills: room102Chain,
    providedOpeningUnits: 424,
  });
  assert.equal(opening.ok, true);
  const bad = validateMeterPeriodOpening({
    priorFinalizedBills: room102Chain,
    providedOpeningUnits: 337,
  });
  assert.equal(bad.ok, false);
});

test('absence of August-generated bill does not block September meter period', () => {
  const chain = assessMeterPeriodChainContinuity(room102Chain);
  assert.equal(chain.ok, true);
  assert.equal(chain.expectedOpeningUnits, 424);
});

test('checkout uses last finalized closing as tail opening (424→479 not 337→479)', () => {
  const finalized = pickFinalizedBillForCheckout(room102Chain, 479);
  assert.ok(finalized);
  assert.equal(finalized.currentReadingUnits, 424);
  const tailUnits = checkoutGrossUnits({
    finalizedBill: finalized,
    checkoutClosingUnits: 479,
    tailOpeningUnits: finalized.currentReadingUnits,
  });
  assert.equal(tailUnits, 55);
  const ledger = buildRoomElectricityMeterPeriodLedger({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-27',
    ratePerUnitPaise: 1600,
    chainOpeningUnits: 337,
    checkoutClosingUnits: 479,
    finalizedBill: {
      billingMonth: '2026-09-01',
      openingUnits: 337,
      closingUnits: 424,
      grossPaise: 139_200,
      ratePerUnitPaise: 1600,
      periodStartDate: '2026-09-01',
      periodEndDate: '2026-09-04',
      finalizedOnDate: '2026-09-05',
    },
    invoiceCredits: [{ customerId: 'c1', customerName: 'R', amountPaise: 139_200, paidPaise: 139_100, status: 'paid' }],
    occupants: [],
    currentCustomerId: 'c1',
    electricityDeductFromDeposit: true,
  });
  const tail = ledger.periods.find((p) => p.id === 'unbilled_tail');
  assert.ok(tail);
  assert.equal(tail.openingUnits, 424);
  assert.equal(tail.closingUnits, 479);
  assert.equal(tail.unitsConsumed, 55);
  assert.equal(tail.grossPaise, 88000);
  const wrongGross = (479 - 337) * 1600;
  assert.notEqual(tail.grossPaise, wrongGross);
});

test('collections attach to finalized bill id path in checkout audit service', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/checkoutElectricityOperatorAudit.ts'),
    'utf8',
  );
  assert.match(src, /eq\(electricityInvoices\.electricityBillId, invoiceBillId\)/);
  assert.doesNotMatch(src, /eq\(electricityInvoices\.billingMonth, billingMonth\)/);
});

test('schema uses meter interval unique index not room+month', () => {
  const schema = readFileSync(
    join(process.cwd(), 'src/db/schema/electricityBills.ts'),
    'utf8',
  );
  assert.match(schema, /electricity_bills_room_meter_interval_unique/);
  assert.match(schema, /periodStartDate/);
  assert.doesNotMatch(schema, /electricity_bills_room_month_unique/);
});

test('migration drops room+month unique and adds meter interval unique', () => {
  const sql = readFileSync(
    join(process.cwd(), 'src/db/migrations/0152_electricity_meter_period_identity.sql'),
    'utf8',
  );
  assert.match(sql, /DROP INDEX IF EXISTS electricity_bills_room_month_unique/);
  assert.match(sql, /electricity_bills_room_meter_interval_unique/);
});
